from __future__ import annotations

from pathlib import Path
from typing import Any

from houston_protocol.messages import CapturePacket, CaptureRecord, CommandKind, DeviceRecord, HeartbeatPayload

from .captures import CaptureStore
from .devices import DeviceStore
from .events import CommandStore, EventStore
from .sqlite import SqliteStore


class Database:
    def __init__(self, path: Path) -> None:
        self.sqlite = SqliteStore(path)
        self.devices = DeviceStore(self.sqlite)
        self.captures = CaptureStore(self.sqlite)
        self.events = EventStore(self.sqlite)
        self.commands = CommandStore(self.sqlite)

    def upsert_device_hello(self, device_id: str, software_version: str, capabilities: list[str]) -> DeviceRecord:
        return self.devices.upsert_hello(device_id, software_version, capabilities)

    def update_device_heartbeat(self, heartbeat: HeartbeatPayload) -> DeviceRecord:
        return self.devices.update_heartbeat(heartbeat)

    def set_device_connected(self, device_id: str, connected: bool, error: str | None = None) -> DeviceRecord | None:
        return self.devices.set_connected(device_id, connected, error)

    def insert_capture(self, device_id: str, packet: CapturePacket) -> CaptureRecord:
        return self.captures.insert(device_id, packet)

    def update_capture_artifact(self, capture_id: str, kind: str, uploaded: bool, url: str | None) -> CaptureRecord | None:
        return self.captures.update_artifact(capture_id, kind, uploaded, url)

    def create_command(self, command_id: str, device_id: str, kind: CommandKind, args: dict[str, Any], status: str) -> None:
        self.commands.create(command_id, device_id, kind, args, status)

    def update_command(self, command_id: str, status: str, result: dict[str, Any] | None = None) -> None:
        self.commands.update(command_id, status, result)

    def add_event(self, topic: str, payload: dict[str, Any]) -> None:
        self.events.add(topic, payload)

    def get_device(self, device_id: str) -> DeviceRecord | None:
        return self.devices.get(device_id)

    def list_devices(self) -> list[DeviceRecord]:
        return self.devices.list()

    def get_capture(self, capture_id: str) -> CaptureRecord | None:
        return self.captures.get(capture_id)

    def list_captures(self, limit: int = 25) -> list[CaptureRecord]:
        return self.captures.list(limit)

    def list_events(self, limit: int = 50) -> list[dict[str, Any]]:
        return self.events.list(limit)
