from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from houston_protocol.messages import DeviceStatus


@dataclass
class RuntimeState:
    status: DeviceStatus = DeviceStatus.IDLE
    capturing_enabled: bool = True
    last_capture_at: datetime | None = None
    last_capture_attempt_at: datetime | None = None
    last_trigger_reason: str | None = None
    last_capture_error: str | None = None


def camera_error(pipeline) -> str | None:
    return getattr(pipeline.frame_source, "last_error", None) if pipeline is not None else None


def capture_blocked_reason(pipeline, camera_available: bool) -> str | None:
    if camera_available:
        return None
    return camera_error(pipeline) or "camera_unavailable"


def heartbeat_details(settings, state: RuntimeState, is_bridge_mode: bool, pipeline) -> dict:
    next_capture_due_at = None
    if not is_bridge_mode and state.capturing_enabled and state.last_capture_at is not None:
        next_capture_due_at = (
            state.last_capture_at + timedelta(seconds=settings.capture_interval_seconds)
        ).isoformat()
    available = True if is_bridge_mode else pipeline.camera_available() if pipeline is not None else False
    return {
        "capturing_enabled": state.capturing_enabled,
        "capture_interval_seconds": settings.capture_interval_seconds,
        "next_capture_due_at": next_capture_due_at,
        "capture_blocked_reason": capture_blocked_reason(pipeline, available),
        "last_capture_attempt_at": state.last_capture_attempt_at,
        "last_trigger_reason": state.last_trigger_reason,
        "last_capture_error": state.last_capture_error,
        "camera_error": camera_error(pipeline),
    }


def snapshot_payload(settings, state: RuntimeState, ground_connected: bool, queue_depth: int, camera_available: bool, adcs_available: bool, recent_captures: list[str], pipeline) -> dict:
    return {
        "device_id": settings.device_id,
        "status": state.status,
        "capturing_enabled": state.capturing_enabled,
        "last_capture_at": state.last_capture_at,
        "queue_depth": queue_depth,
        "ground_connected": ground_connected,
        "camera_available": camera_available,
        "adcs_available": adcs_available,
        "capture_blocked_reason": capture_blocked_reason(pipeline, camera_available),
        "last_capture_attempt_at": state.last_capture_attempt_at,
        "last_trigger_reason": state.last_trigger_reason,
        "last_capture_error": state.last_capture_error,
        "camera_error": camera_error(pipeline),
        "recent_captures": recent_captures,
        "settings": {
            "edge_mode": settings.edge_mode,
            "capture_interval_seconds": settings.capture_interval_seconds,
            "capture_source": settings.capture_source,
            "adcs_source": settings.adcs_source,
            "bridge_watch_dir": str(settings.bridge_watch_dir) if settings.bridge_watch_dir else None,
            "anomaly_threshold": settings.anomaly_threshold,
            "minimum_region_area": settings.minimum_region_area,
        },
    }
