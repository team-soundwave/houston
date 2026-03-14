from __future__ import annotations

import asyncio
import json
import logging
from typing import Awaitable, Callable

import websockets

from houston_protocol.messages import (
    CommandPayload,
    DeviceHelloPayload,
    EventType,
    WsEnvelope,
    parse_envelope,
)


logger = logging.getLogger(__name__)


CommandHandler = Callable[[CommandPayload], Awaitable[None]]


class GroundClient:
    def __init__(self, ws_url: str, hello: DeviceHelloPayload, on_command: CommandHandler) -> None:
        self.ws_url = ws_url
        self.hello = hello
        self.on_command = on_command
        self._outgoing: asyncio.Queue[dict] = asyncio.Queue()
        self._stopped = asyncio.Event()
        self._connected = asyncio.Event()

    async def run(self) -> None:
        while not self._stopped.is_set():
            try:
                async with websockets.connect(self.ws_url, ping_interval=20, ping_timeout=20) as websocket:
                    self._connected.set()
                    await websocket.send(
                        WsEnvelope(type=EventType.HELLO, payload=self.hello).model_dump_json()
                    )
                    sender = asyncio.create_task(self._sender(websocket))
                    receiver = asyncio.create_task(self._receiver(websocket))
                    done, pending = await asyncio.wait(
                        {sender, receiver},
                        return_when=asyncio.FIRST_EXCEPTION,
                    )
                    for task in pending:
                        task.cancel()
                    for task in done:
                        task.result()
            except Exception as exc:
                logger.warning("ground websocket disconnected: %s", exc)
            finally:
                self._connected.clear()
                if not self._stopped.is_set():
                    await asyncio.sleep(2)

    async def stop(self) -> None:
        self._stopped.set()

    async def emit(self, envelope: WsEnvelope) -> None:
        await self._outgoing.put(envelope.model_dump(mode="json"))

    def is_connected(self) -> bool:
        return self._connected.is_set()

    async def _sender(self, websocket) -> None:
        while True:
            message = await self._outgoing.get()
            try:
                await websocket.send(json.dumps(message, default=str))
            except Exception:
                await self._outgoing.put(message)
                raise

    async def _receiver(self, websocket) -> None:
        async for raw_message in websocket:
            data = json.loads(raw_message)
            envelope = parse_envelope(data)
            if envelope.type == EventType.COMMAND and isinstance(envelope.payload, CommandPayload):
                await self.on_command(envelope.payload)
