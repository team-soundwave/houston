from __future__ import annotations

import json
from typing import Any

from houston_protocol.messages import CommandKind

from .sqlite import SqliteStore, utc_now


class EventStore:
    def __init__(self, db: SqliteStore) -> None:
        self.db = db

    def add(self, topic: str, payload: dict[str, Any]) -> None:
        self.db.execute(
            "insert into events (topic, emitted_at, payload_json) values (?, ?, ?)",
            (topic, utc_now(), json.dumps(payload, default=str)),
        )

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.db.fetchall(
            "select topic, emitted_at, payload_json from events order by id desc limit ?",
            (limit,),
        )
        return [{"topic": row["topic"], "emitted_at": row["emitted_at"], "payload": json.loads(row["payload_json"])} for row in rows]


class CommandStore:
    def __init__(self, db: SqliteStore) -> None:
        self.db = db

    def create(self, command_id: str, device_id: str, kind: CommandKind, args: dict[str, Any], status: str) -> None:
        self.db.execute(
            """
            insert into commands (command_id, device_id, kind, args_json, issued_at, status)
            values (?, ?, ?, ?, ?, ?)
            """,
            (command_id, device_id, kind.value, json.dumps(args), utc_now(), status),
        )

    def update(self, command_id: str, status: str, result: dict[str, Any] | None = None) -> None:
        self.db.execute(
            "update commands set status = ?, result_json = ? where command_id = ?",
            (status, json.dumps(result or {}), command_id),
        )
