from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class EventType(str, Enum):
    HELLO = "hello"
    HEARTBEAT = "heartbeat"
    CAPTURE_STARTED = "capture_started"
    CAPTURE_COMPLETED = "capture_completed"
    COMMAND = "command"
    COMMAND_ACK = "command_ack"
    COMMAND_RESULT = "command_result"
    ERROR = "error"
    SNAPSHOT = "snapshot"


class CommandKind(str, Enum):
    START_CAPTURE = "start_capture"
    STOP_CAPTURE = "stop_capture"
    SET_INTERVAL = "set_interval"
    REQUEST_SNAPSHOT = "request_snapshot"
    UPDATE_THRESHOLDS = "update_thresholds"


class DeviceStatus(str, Enum):
    IDLE = "idle"
    CAPTURING = "capturing"
    STOPPED = "stopped"
    ERROR = "error"


class ArtifactKind(str, Enum):
    RAW = "raw"
    INTENSITY = "intensity"
    MASK = "mask"
    MATRIX = "matrix"
    PACKET = "packet"


class ADCSState(BaseModel):
    timestamp: float
    position_mcmf: list[float]
    velocity_mps: list[float]
    attitude_quaternion: list[float]


class Region(BaseModel):
    bbox: list[int]
    area: float


class ArtifactDescriptor(BaseModel):
    kind: ArtifactKind
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    uploaded: bool = False
    url: str | None = None


class CapturePacket(BaseModel):
    capture_id: str
    timestamp: datetime
    adcs: ADCSState
    regions: list[Region]
    matrix_shape: list[int]
    matrix_data: list[list[float]] = Field(default_factory=list)
    region_count: int
    max_intensity: float
    mean_intensity: float
    artifacts: list[ArtifactDescriptor] = Field(default_factory=list)


class DeviceHelloPayload(BaseModel):
    device_id: str
    token: str
    software_version: str = "0.1.0"
    capabilities: list[str] = Field(default_factory=list)


class HeartbeatPayload(BaseModel):
    device_id: str
    emitted_at: datetime
    status: DeviceStatus
    camera_available: bool
    queue_depth: int
    last_capture_at: datetime | None = None
    disk_free_bytes: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class CaptureStartedPayload(BaseModel):
    device_id: str
    capture_id: str
    emitted_at: datetime


class CaptureCompletedPayload(BaseModel):
    device_id: str
    emitted_at: datetime
    capture: CapturePacket


class CommandPayload(BaseModel):
    command_id: str
    device_id: str
    kind: CommandKind
    args: dict[str, Any] = Field(default_factory=dict)
    issued_at: datetime


class CommandAckPayload(BaseModel):
    command_id: str
    device_id: str
    accepted: bool
    emitted_at: datetime
    message: str | None = None


class CommandResultPayload(BaseModel):
    command_id: str
    device_id: str
    ok: bool
    emitted_at: datetime
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class ErrorPayload(BaseModel):
    device_id: str | None = None
    emitted_at: datetime
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class WsEnvelope(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    type: EventType
    payload: Any


class DeviceRecord(BaseModel):
    device_id: str
    connected: bool
    status: DeviceStatus
    camera_available: bool
    queue_depth: int
    software_version: str | None = None
    last_seen_at: datetime | None = None
    last_capture_at: datetime | None = None
    last_error: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class CaptureRecord(BaseModel):
    capture_id: str
    device_id: str
    timestamp: datetime
    region_count: int
    max_intensity: float
    mean_intensity: float
    matrix_data: list[list[float]] = Field(default_factory=list)
    artifacts: list[ArtifactDescriptor]
    regions: list[Region]


class UIEvent(BaseModel):
    topic: Literal["device", "capture", "capture_deleted", "command", "event"]
    emitted_at: datetime
    data: dict[str, Any]


_payload_model_map: dict[EventType, type[BaseModel]] = {
    EventType.HELLO: DeviceHelloPayload,
    EventType.HEARTBEAT: HeartbeatPayload,
    EventType.CAPTURE_STARTED: CaptureStartedPayload,
    EventType.CAPTURE_COMPLETED: CaptureCompletedPayload,
    EventType.COMMAND: CommandPayload,
    EventType.COMMAND_ACK: CommandAckPayload,
    EventType.COMMAND_RESULT: CommandResultPayload,
    EventType.ERROR: ErrorPayload,
}


def parse_envelope(data: dict[str, Any]) -> WsEnvelope:
    event_type = EventType(data["type"])
    payload_data = data.get("payload", {})
    model_type = _payload_model_map.get(event_type)
    if model_type is None:
        return WsEnvelope(type=event_type, payload=payload_data)
    return WsEnvelope(type=event_type, payload=model_type.model_validate(payload_data))
