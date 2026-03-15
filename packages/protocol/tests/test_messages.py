from datetime import datetime, UTC

from houston_protocol.messages import EventType, HeartbeatPayload, UIEvent, WsEnvelope, parse_envelope


def test_parse_heartbeat_envelope() -> None:
    data = {
        "type": "heartbeat",
        "payload": {
            "device_id": "edge-1",
            "emitted_at": datetime.now(UTC).isoformat(),
            "status": "idle",
            "camera_available": True,
            "queue_depth": 2,
        },
    }

    envelope = parse_envelope(data)

    assert envelope.type == EventType.HEARTBEAT
    assert isinstance(envelope.payload, HeartbeatPayload)
    assert envelope.payload.device_id == "edge-1"


def test_ui_event_accepts_capture_deleted() -> None:
    event = UIEvent(topic="capture_deleted", emitted_at=datetime.now(UTC), data={"capture_id": "abc"})
    assert event.topic == "capture_deleted"
