from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .service import EdgeRuntime


settings = get_settings()
runtime = EdgeRuntime(settings)


class IntervalRequest(BaseModel):
    seconds: float


@asynccontextmanager
async def lifespan(_: FastAPI):
    await runtime.start()
    yield
    await runtime.stop()


app = FastAPI(title="Houston Edge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status")
async def status() -> dict:
    return await runtime.snapshot()


@app.post("/api/commands/capture")
async def capture_now() -> dict[str, bool]:
    await runtime.trigger_capture()
    return {"queued": True}


@app.post("/api/commands/start")
async def start_capture_loop() -> dict[str, bool]:
    runtime.state.capturing_enabled = True
    await runtime.trigger_capture("api:start")
    return {"capturing_enabled": True}


@app.post("/api/commands/stop")
async def stop_capture_loop() -> dict[str, bool]:
    runtime.state.capturing_enabled = False
    return {"capturing_enabled": False}


@app.post("/api/commands/interval")
async def update_interval(request: IntervalRequest) -> dict[str, float]:
    settings.capture_interval_seconds = request.seconds
    return {"capture_interval_seconds": settings.capture_interval_seconds}
