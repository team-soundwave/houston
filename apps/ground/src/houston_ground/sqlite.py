from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class SqliteStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.lock = Lock()
        self._init_schema()

    def execute_script(self, script: str) -> None:
        with self.lock:
            self.connection.executescript(script)
            self.connection.commit()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self.lock:
            self.connection.execute(sql, params)
            self.connection.commit()

    def fetchone(self, sql: str, params: tuple = ()):
        with self.lock:
            return self.connection.execute(sql, params).fetchone()

    def fetchall(self, sql: str, params: tuple = ()):
        with self.lock:
            return self.connection.execute(sql, params).fetchall()

    def table_columns(self, table: str) -> set[str]:
        with self.lock:
            rows = self.connection.execute(f"pragma table_info({table})").fetchall()
        return {row["name"] for row in rows}

    def _init_schema(self) -> None:
        self.execute_script(
            """
            create table if not exists devices (
                device_id text primary key,
                software_version text,
                connected integer not null default 0,
                status text not null,
                camera_available integer not null default 0,
                queue_depth integer not null default 0,
                last_seen_at text,
                last_capture_at text,
                last_error text,
                capabilities_json text not null default '[]',
                details_json text not null default '{}'
            );

            create table if not exists captures (
                capture_id text primary key,
                device_id text not null,
                timestamp text not null,
                packet_json text not null,
                created_at text not null
            );

            create table if not exists commands (
                command_id text primary key,
                device_id text not null,
                kind text not null,
                args_json text not null,
                issued_at text not null,
                status text not null,
                result_json text
            );

            create table if not exists events (
                id integer primary key autoincrement,
                topic text not null,
                emitted_at text not null,
                payload_json text not null
            );
            """
        )
        self._ensure_column("devices", "capabilities_json", "text not null default '[]'")
        self._ensure_column("devices", "details_json", "text not null default '{}'")

    def _ensure_column(self, table: str, column: str, ddl: str) -> None:
        if column in self.table_columns(table):
            return
        self.execute(f"alter table {table} add column {column} {ddl}")
