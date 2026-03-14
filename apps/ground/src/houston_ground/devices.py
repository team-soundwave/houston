from __future__ import annotations

import json
from datetime import datetime

from houston_protocol.messages import DeviceRecord, DeviceStatus, HeartbeatPayload

from .sqlite import SqliteStore, utc_now


def parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class DeviceStore:
    def __init__(self, db: SqliteStore) -> None:
        self.db = db

    def upsert_hello(self, device_id: str, software_version: str, capabilities: list[str]) -> DeviceRecord:
        self.db.execute(
            """
            insert into devices (device_id, software_version, connected, status, last_seen_at, capabilities_json)
            values (?, ?, 1, ?, ?, ?)
            on conflict(device_id) do update set
                software_version = excluded.software_version,
                capabilities_json = excluded.capabilities_json,
                connected = 1,
                status = excluded.status,
                last_seen_at = excluded.last_seen_at
            """,
            (device_id, software_version, DeviceStatus.IDLE.value, utc_now(), json.dumps(capabilities)),
        )
        return self.get(device_id)

    def update_heartbeat(self, heartbeat: HeartbeatPayload) -> DeviceRecord:
        self.db.execute(
            """
            insert into devices (device_id, connected, status, camera_available, queue_depth, last_seen_at, last_capture_at, details_json)
            values (?, 1, ?, ?, ?, ?, ?, ?)
            on conflict(device_id) do update set
                connected = 1,
                status = excluded.status,
                camera_available = excluded.camera_available,
                queue_depth = excluded.queue_depth,
                last_seen_at = excluded.last_seen_at,
                last_capture_at = excluded.last_capture_at,
                details_json = excluded.details_json
            """,
            (
                heartbeat.device_id,
                heartbeat.status.value,
                int(heartbeat.camera_available),
                heartbeat.queue_depth,
                heartbeat.emitted_at.isoformat(),
                heartbeat.last_capture_at.isoformat() if heartbeat.last_capture_at else None,
                json.dumps(heartbeat.details),
            ),
        )
        return self.get(heartbeat.device_id)

    def set_connected(self, device_id: str, connected: bool, error: str | None = None) -> DeviceRecord | None:
        self.db.execute(
            """
            update devices
            set connected = ?, last_seen_at = ?, last_error = coalesce(?, last_error)
            where device_id = ?
            """,
            (int(connected), utc_now(), error, device_id),
        )
        return self.get(device_id)

    def get(self, device_id: str) -> DeviceRecord | None:
        row = self.db.fetchone("select * from devices where device_id = ?", (device_id,))
        if row is None:
            return None
        return DeviceRecord(
            device_id=row["device_id"],
            connected=bool(row["connected"]),
            status=DeviceStatus(row["status"]),
            camera_available=bool(row["camera_available"]),
            queue_depth=row["queue_depth"],
            software_version=row["software_version"],
            last_seen_at=parse_dt(row["last_seen_at"]),
            last_capture_at=parse_dt(row["last_capture_at"]),
            last_error=row["last_error"],
            capabilities=json.loads(row["capabilities_json"] or "[]"),
            details=json.loads(row["details_json"] or "{}"),
        )

    def list(self) -> list[DeviceRecord]:
        rows = self.db.fetchall(
            """
            select device_id
            from devices
            order by (last_seen_at is null), last_seen_at desc
            """
        )
        return [device for row in rows if (device := self.get(row["device_id"])) is not None]
