from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from houston_protocol.messages import (
    CommandKind,
    CommandPayload,
    CommandResultPayload,
    DeviceHelloPayload,
    EventType,
    HeartbeatPayload,
    WsEnvelope,
    parse_envelope,
)

from .config import get_settings
from .db import Database
from .hubs import DeviceHub, UIHub
from .storage import Storage


settings = get_settings()
db = Database(settings.database_path)
storage = Storage(settings.storage_dir)
device_hub = DeviceHub()
ui_hub = UIHub()


class CommandRequest(BaseModel):
    kind: CommandKind
    args: dict = Field(default_factory=dict)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Houston Ground", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ui_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/artifacts", StaticFiles(directory=settings.storage_dir), name="artifacts")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/devices")
async def list_devices() -> list[dict]:
    return [device.model_dump(mode="json") for device in db.list_devices()]


@app.get("/api/captures")
async def list_captures(limit: int = Query(default=25, le=200)) -> list[dict]:
    return [capture.model_dump(mode="json") for capture in db.list_captures(limit)]


@app.get("/api/captures/{capture_id}")
async def capture_detail(capture_id: str) -> dict:
    capture = db.get_capture(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail="capture not found")
    return capture.model_dump(mode="json")


@app.get("/api/events")
async def list_events(limit: int = Query(default=50, le=200)) -> list[dict]:
    return db.list_events(limit)


@app.post("/api/devices/{device_id}/commands")
async def issue_command(device_id: str, request: CommandRequest) -> dict:
    if not device_hub.connected(device_id):
        raise HTTPException(status_code=409, detail="device is offline")
    command = CommandPayload(
        command_id=uuid4().hex,
        device_id=device_id,
        kind=request.kind,
        args=request.args,
        issued_at=datetime.now(UTC),
    )
    db.create_command(command.command_id, device_id, request.kind, request.args, "queued")
    await device_hub.send_command(
        device_id,
        WsEnvelope(type=EventType.COMMAND, payload=command),
    )
    db.update_command(command.command_id, "sent")
    db.add_event("command", {"device_id": device_id, "command": command.model_dump(mode="json")})
    await ui_hub.emit("command", {"device_id": device_id, "command": command.model_dump(mode="json")})
    return command.model_dump(mode="json")


@app.post("/api/edge/artifacts/{capture_id}/{kind}")
async def upload_artifact(
    capture_id: str,
    kind: str,
    device_id: str = Query(...),
    sha256: str = Query(...),
    file: UploadFile = File(...),
) -> dict[str, str]:
    content = await file.read()
    target = storage.save_artifact(device_id, capture_id, file.filename, content)
    db.update_capture_artifact(
        capture_id,
        kind,
        uploaded=True,
        url=storage.artifact_url(device_id, capture_id, file.filename),
    )
    payload = {
        "device_id": device_id,
        "capture_id": capture_id,
        "kind": kind,
        "filename": file.filename,
        "sha256": sha256,
        "path": str(target),
    }
    db.add_event("artifact", payload)
    await ui_hub.emit("event", payload)
    return {"status": "stored", "filename": file.filename}


@app.websocket("/ws/edge")
async def edge_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    device_id: str | None = None
    try:
        hello_envelope = parse_envelope(await websocket.receive_json())
        if hello_envelope.type != EventType.HELLO or not isinstance(hello_envelope.payload, DeviceHelloPayload):
            await websocket.close(code=4400)
            return
        hello = hello_envelope.payload
        if hello.token != settings.edge_token:
            await websocket.close(code=4401)
            return
        device_id = hello.device_id
        await device_hub.register(device_id, websocket)
        device = db.upsert_device_hello(device_id, hello.software_version, hello.capabilities)
        db.add_event("device", {"device_id": device_id, "connected": True})
        await ui_hub.emit("device", device.model_dump(mode="json"))

        while True:
            envelope = parse_envelope(await websocket.receive_json())
            await handle_device_message(device_id, envelope)
    except WebSocketDisconnect:
        pass
    finally:
        if device_id is not None:
            device_hub.unregister(device_id)
            device = db.set_device_connected(device_id, False)
            if device is not None:
                db.add_event("device", {"device_id": device_id, "connected": False})
                await ui_hub.emit("device", device.model_dump(mode="json"))


@app.websocket("/ws/ui")
async def ui_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    await ui_hub.register(websocket)
    await ui_hub.send_snapshot(
        websocket,
        {
            "devices": [device.model_dump(mode="json") for device in db.list_devices()],
            "captures": [capture.model_dump(mode="json") for capture in db.list_captures(20)],
            "events": db.list_events(20),
        },
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ui_hub.unregister(websocket)


async def handle_device_message(device_id: str, envelope: WsEnvelope) -> None:
    if envelope.type == EventType.HEARTBEAT and isinstance(envelope.payload, HeartbeatPayload):
        device = db.update_device_heartbeat(envelope.payload)
        db.add_event("heartbeat", {"device_id": device_id, "heartbeat": envelope.payload.model_dump(mode="json")})
        await ui_hub.emit("device", device.model_dump(mode="json"))
        return
    if envelope.type == EventType.CAPTURE_STARTED:
        db.add_event("capture", {"device_id": device_id, "phase": "started", "payload": envelope.model_dump(mode="json")})
        await ui_hub.emit("event", {"device_id": device_id, "phase": "started", "payload": envelope.model_dump(mode="json")})
        return
    if envelope.type == EventType.CAPTURE_COMPLETED:
        packet = envelope.payload.capture
        capture = db.insert_capture(device_id, packet)
        db.add_event("capture", {"device_id": device_id, "phase": "completed", "capture": capture.model_dump(mode="json")})
        await ui_hub.emit("capture", capture.model_dump(mode="json"))
        return
    if envelope.type == EventType.COMMAND_RESULT and isinstance(envelope.payload, CommandResultPayload):
        db.update_command(envelope.payload.command_id, "completed", envelope.payload.model_dump(mode="json"))
        db.add_event("command", {"device_id": device_id, "result": envelope.payload.model_dump(mode="json")})
        await ui_hub.emit("command", {"device_id": device_id, "result": envelope.payload.model_dump(mode="json")})
        return
    db.add_event("event", {"device_id": device_id, "payload": envelope.model_dump(mode="json")})
    await ui_hub.emit("event", {"device_id": device_id, "payload": envelope.model_dump(mode="json")})


web_dist = settings.web_dist_dir
if web_dist.exists():
    app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
