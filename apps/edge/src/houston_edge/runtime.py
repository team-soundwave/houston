from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4
import httpx
from houston_protocol.messages import (
    CommandKind,
    CommandPayload,
    CommandResultPayload,
    DeviceStatus,
    EventType,
    WsEnvelope,
)
from .bridge import BridgeIngestor
from .config import EdgeSettings
from .ground_client import GroundClient
from .payloads import ack_payload, heartbeat_payload, hello_payload
from .pipeline import CapturePipeline
from .spool import SpoolStore
from .uploads import ArtifactUploader
logger = logging.getLogger(__name__)
@dataclass
class RuntimeState:
    status: DeviceStatus = DeviceStatus.IDLE
    capturing_enabled: bool = True
    last_capture_at: datetime | None = None
class EdgeRuntime:
    def __init__(self, settings: EdgeSettings) -> None:
        self.settings = settings
        self.pipeline = None if self._is_bridge_mode else CapturePipeline(settings)
        self.bridge = BridgeIngestor(settings) if self._is_bridge_mode else None
        self.spool = SpoolStore(settings.spool_dir)
        self.state = RuntimeState()
        self._manual_captures: asyncio.Queue[str] = asyncio.Queue()
        self._tasks: list[asyncio.Task] = []
        self._http_client = httpx.AsyncClient(timeout=30.0)
        self._uploader = ArtifactUploader(settings, self.spool, self._http_client)
        self._ground_client = GroundClient(self.settings.ground_ws_url, hello_payload(self.settings), self.handle_command)
    async def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._ground_client.run(), name="ground-client"),
            asyncio.create_task(self._heartbeat_loop(), name="heartbeat"),
            asyncio.create_task(self._ingest_loop(), name="capture"),
            asyncio.create_task(self._upload_loop(), name="upload"),
        ]
        if not self._is_bridge_mode:
            await self.trigger_capture("startup")

    async def stop(self) -> None:
        await self._ground_client.stop()
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        await self._http_client.aclose()
        if self.pipeline is not None:
            self.pipeline.close()
    async def snapshot(self) -> dict:
        queue_depth = await self.spool.queue_depth()
        return {
            "device_id": self.settings.device_id,
            "status": self.state.status,
            "capturing_enabled": self.state.capturing_enabled,
            "last_capture_at": self.state.last_capture_at,
            "queue_depth": queue_depth,
            "ground_connected": self._ground_client.is_connected(),
            "camera_available": self._camera_available(),
            "recent_captures": [item.capture.capture_id for item in await self.spool.latest_manifests()],
            "settings": {
                "edge_mode": self.settings.edge_mode,
                "capture_interval_seconds": self.settings.capture_interval_seconds,
                "capture_source": self.settings.capture_source,
                "adcs_source": self.settings.adcs_source,
                "bridge_watch_dir": str(self.settings.bridge_watch_dir) if self.settings.bridge_watch_dir else None,
                "anomaly_threshold": self.settings.anomaly_threshold,
                "minimum_region_area": self.settings.minimum_region_area,
            },
        }

    async def trigger_capture(self, reason: str = "manual") -> None:
        await self._manual_captures.put(reason)

    async def handle_command(self, command: CommandPayload) -> None:
        await self._ground_client.emit(
            WsEnvelope(type=EventType.COMMAND_ACK, payload=ack_payload(self.settings, command.command_id, f"accepted {command.kind}"))
        )
        ok, result, error = await self._execute_command(command)
        await self._ground_client.emit(
            WsEnvelope(
                type=EventType.COMMAND_RESULT,
                payload=CommandResultPayload(
                    command_id=command.command_id,
                    device_id=self.settings.device_id,
                    ok=ok,
                    emitted_at=datetime.now(UTC),
                    result=result,
                    error=error,
                ),
            )
        )

    async def _heartbeat_loop(self) -> None:
        while True:
            await self._ground_client.emit(WsEnvelope(type=EventType.HEARTBEAT, payload=await self._build_heartbeat()))
            await asyncio.sleep(self.settings.heartbeat_interval_seconds)

    async def _ingest_loop(self) -> None:
        if self._is_bridge_mode:
            await self._bridge_loop()
        else:
            await self._capture_loop()

    async def _capture_loop(self) -> None:
        while True:
            if not self._capture_ready():
                self.state.status = DeviceStatus.ERROR
                await asyncio.sleep(self.settings.capture_interval_seconds)
                continue
            if not self.state.capturing_enabled:
                await self._manual_captures.get()
            else:
                try:
                    await asyncio.wait_for(self._manual_captures.get(), timeout=self.settings.capture_interval_seconds)
                except TimeoutError:
                    pass
            await self._capture_once()

    async def _bridge_loop(self) -> None:
        while True:
            if self.state.capturing_enabled and self.bridge is not None:
                for bundle in self.bridge.poll():
                    await self._publish_bundle(bundle)
            await asyncio.sleep(self.settings.bridge_poll_seconds)

    async def _upload_loop(self) -> None:
        while True:
            try:
                for manifest in await self.spool.list_pending():
                    await self._uploader.upload_manifest(manifest)
            except Exception as exc:
                logger.warning("artifact upload pass failed: %s", exc)
            await asyncio.sleep(self.settings.upload_retry_seconds)

    async def _capture_once(self) -> None:
        capture_id = f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%S')}-{uuid4().hex[:6]}"
        self.state.status = DeviceStatus.CAPTURING
        await self._ground_client.emit(
            WsEnvelope(
                type=EventType.CAPTURE_STARTED,
                payload={"device_id": self.settings.device_id, "capture_id": capture_id, "emitted_at": datetime.now(UTC)},
            )
        )
        manifest = await self.spool.save_capture(self.pipeline.run_capture(capture_id))
        await self._complete_capture(manifest.capture)

    async def _publish_bundle(self, bundle) -> None:
        self.state.status = DeviceStatus.CAPTURING
        await self._ground_client.emit(
            WsEnvelope(
                type=EventType.CAPTURE_STARTED,
                payload={"device_id": self.settings.device_id, "capture_id": bundle.packet.capture_id, "emitted_at": datetime.now(UTC)},
            )
        )
        manifest = await self.spool.save_capture(bundle)
        await self._complete_capture(manifest.capture)

    async def _complete_capture(self, capture) -> None:
        self.state.status = DeviceStatus.IDLE
        self.state.last_capture_at = capture.timestamp
        await self._ground_client.emit(
            WsEnvelope(
                type=EventType.CAPTURE_COMPLETED,
                payload={"device_id": self.settings.device_id, "emitted_at": datetime.now(UTC), "capture": capture},
            )
        )

    async def _execute_command(self, command: CommandPayload) -> tuple[bool, dict, str | None]:
        try:
            result = await self._apply_command(command)
            return True, result, None
        except Exception as exc:
            logger.exception("command failed")
            return False, {}, str(exc)

    async def _apply_command(self, command: CommandPayload) -> dict:
        if command.kind == CommandKind.START_CAPTURE:
            self.state.capturing_enabled = True
            if not self._is_bridge_mode: await self.trigger_capture("command:start_capture")
            return {"capturing_enabled": True}
        if command.kind == CommandKind.STOP_CAPTURE:
            self.state.capturing_enabled = False
            return {"capturing_enabled": False}
        if command.kind == CommandKind.SET_INTERVAL:
            if self._is_bridge_mode:
                raise RuntimeError("set_interval is not supported in bridge mode")
            self.settings.capture_interval_seconds = float(command.args["seconds"])
            return {"capture_interval_seconds": self.settings.capture_interval_seconds}
        if command.kind == CommandKind.REQUEST_SNAPSHOT:
            if self._is_bridge_mode:
                raise RuntimeError("request_snapshot is not supported in bridge mode")
            await self.trigger_capture("command:request_snapshot")
            return {"queued_capture": True}
        if command.kind == CommandKind.UPDATE_THRESHOLDS:
            if self._is_bridge_mode:
                raise RuntimeError("threshold updates are not supported in bridge mode")
            self.pipeline.update_thresholds(command.args.get("threshold"), command.args.get("minimum_region_area"))
            return {"anomaly_threshold": self.settings.anomaly_threshold, "minimum_region_area": self.settings.minimum_region_area}
        raise ValueError(f"unsupported command {command.kind}")

    async def _build_heartbeat(self):
        return heartbeat_payload(
            settings=self.settings,
            status=self.state.status,
            queue_depth=await self.spool.queue_depth(),
            last_capture_at=self.state.last_capture_at,
            camera_available=self._camera_available(),
            adcs_available=self._adcs_available(),
            details=self._heartbeat_details(),
        )

    @property
    def _is_bridge_mode(self) -> bool:
        return self.settings.capture_source == "bridge"
    def _camera_available(self) -> bool:
        return self.bridge.available() if self._is_bridge_mode and self.bridge is not None else self.pipeline.camera_available() if self.pipeline is not None else False
    def _adcs_available(self) -> bool:
        return False if self._is_bridge_mode or self.pipeline is None else self.pipeline.adcs_available()

    def _capture_ready(self) -> bool:
        return self._camera_available()

    def _heartbeat_details(self) -> dict:
        next_capture_due_at = None
        if (
            not self._is_bridge_mode
            and self.state.capturing_enabled
            and self.state.last_capture_at is not None
        ):
            next_capture_due_at = (
                self.state.last_capture_at + timedelta(seconds=self.settings.capture_interval_seconds)
            ).isoformat()
        return {
            "capturing_enabled": self.state.capturing_enabled,
            "capture_interval_seconds": self.settings.capture_interval_seconds,
            "next_capture_due_at": next_capture_due_at,
            "capture_blocked_reason": None if self._camera_available() else "camera_unavailable",
        }
