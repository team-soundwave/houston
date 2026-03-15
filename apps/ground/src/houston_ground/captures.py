from __future__ import annotations

from houston_protocol.messages import CapturePacket, CaptureRecord

from .sqlite import SqliteStore, utc_now


class CaptureStore:
    def __init__(self, db: SqliteStore) -> None:
        self.db = db

    def insert(self, device_id: str, packet: CapturePacket) -> CaptureRecord:
        self.db.execute(
            """
            insert or replace into captures (capture_id, device_id, timestamp, packet_json, created_at)
            values (?, ?, ?, ?, ?)
            """,
            (packet.capture_id, device_id, packet.timestamp.isoformat(), packet.model_dump_json(), utc_now()),
        )
        return self.get(packet.capture_id)

    def update_artifact(self, capture_id: str, kind: str, uploaded: bool, url: str | None) -> CaptureRecord | None:
        packet = self._packet(capture_id)
        if packet is None:
            return None
        for artifact in packet.artifacts:
            if artifact.kind.value == kind:
                artifact.uploaded = uploaded
                artifact.url = url
        self.db.execute("update captures set packet_json = ? where capture_id = ?", (packet.model_dump_json(), capture_id))
        return self.get(capture_id)

    def get(self, capture_id: str) -> CaptureRecord | None:
        row = self.db.fetchone("select device_id, packet_json from captures where capture_id = ?", (capture_id,))
        if row is None:
            return None
        packet = CapturePacket.model_validate_json(row["packet_json"])
        return CaptureRecord(
            capture_id=packet.capture_id,
            device_id=row["device_id"],
            timestamp=packet.timestamp,
            region_count=packet.region_count,
            max_intensity=packet.max_intensity,
            mean_intensity=packet.mean_intensity,
            matrix_data=packet.matrix_data,
            artifacts=packet.artifacts,
            regions=packet.regions,
        )

    def list(self, limit: int = 25) -> list[CaptureRecord]:
        rows = self.db.fetchall("select capture_id from captures order by timestamp desc limit ?", (limit,))
        return [capture for row in rows if (capture := self.get(row["capture_id"])) is not None]

    def delete(self, capture_id: str) -> CaptureRecord | None:
        capture = self.get(capture_id)
        if capture is None:
            return None
        self.db.execute("delete from captures where capture_id = ?", (capture_id,))
        return capture

    def _packet(self, capture_id: str) -> CapturePacket | None:
        row = self.db.fetchone("select packet_json from captures where capture_id = ?", (capture_id,))
        return CapturePacket.model_validate_json(row["packet_json"]) if row else None
