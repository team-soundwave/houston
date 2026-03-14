from __future__ import annotations

import shutil
from datetime import UTC, datetime

from houston_protocol.messages import CommandAckPayload, DeviceHelloPayload, HeartbeatPayload

from .config import EdgeSettings


def hello_payload(settings: EdgeSettings) -> DeviceHelloPayload:
    return DeviceHelloPayload(
        device_id=settings.device_id,
        token=settings.device_token,
        software_version=settings.device_version,
        capabilities=["capture", "telemetry", "artifact_upload", settings.capture_source, settings.edge_mode],
    )


def ack_payload(settings: EdgeSettings, command_id: str, message: str) -> CommandAckPayload:
    return CommandAckPayload(
        command_id=command_id,
        device_id=settings.device_id,
        accepted=True,
        emitted_at=datetime.now(UTC),
        message=message,
    )


def heartbeat_payload(
    settings: EdgeSettings,
    status,
    queue_depth: int,
    last_capture_at,
    camera_available: bool,
    adcs_available: bool,
    details: dict | None = None,
) -> HeartbeatPayload:
    payload_details = {
        "edge_mode": settings.edge_mode,
        "capture_source": settings.capture_source,
        "adcs_source": settings.adcs_source,
        "adcs_available": adcs_available,
        "bridge_watch_dir": str(settings.bridge_watch_dir) if settings.bridge_watch_dir else None,
    }
    if details:
        payload_details.update(details)
    return HeartbeatPayload(
        device_id=settings.device_id,
        emitted_at=datetime.now(UTC),
        status=status,
        camera_available=camera_available,
        queue_depth=queue_depth,
        last_capture_at=last_capture_at,
        disk_free_bytes=shutil.disk_usage(settings.spool_dir).free,
        details=payload_details,
    )
