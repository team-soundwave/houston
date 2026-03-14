from __future__ import annotations

from datetime import UTC, datetime

from fastapi import WebSocket

from houston_protocol.messages import EventType, UIEvent, WsEnvelope


class DeviceHub:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def register(self, device_id: str, websocket: WebSocket) -> None:
        self._connections[device_id] = websocket

    def unregister(self, device_id: str) -> None:
        self._connections.pop(device_id, None)

    def connected(self, device_id: str) -> bool:
        return device_id in self._connections

    async def send_command(self, device_id: str, envelope: WsEnvelope) -> None:
        websocket = self._connections.get(device_id)
        if websocket is None:
            raise RuntimeError(f"device {device_id} is offline")
        await websocket.send_json(envelope.model_dump(mode="json"))


class UIHub:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def register(self, websocket: WebSocket) -> None:
        self._connections.add(websocket)

    def unregister(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, event: UIEvent) -> None:
        payload = event.model_dump(mode="json")
        dead: list[WebSocket] = []
        for websocket in self._connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.unregister(websocket)

    async def send_snapshot(self, websocket: WebSocket, snapshot: dict) -> None:
        await websocket.send_json(
            WsEnvelope(
                type=EventType.SNAPSHOT,
                payload=snapshot,
            ).model_dump(mode="json")
        )

    async def emit(self, topic: str, data: dict) -> None:
        await self.broadcast(UIEvent(topic=topic, emitted_at=datetime.now(UTC), data=data))
