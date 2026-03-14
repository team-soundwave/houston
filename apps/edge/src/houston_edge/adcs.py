from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from typing import Protocol

from houston_protocol.messages import ADCSState

from .config import EdgeSettings


class ADCSProvider(Protocol):
    def available(self) -> bool: ...
    def get_state(self) -> ADCSState: ...


class MockADCS:
    def __init__(self, available: bool = True) -> None:
        self._available = available

    def available(self) -> bool:
        return self._available

    def get_state(self) -> ADCSState:
        if not self._available:
            raise RuntimeError("ADCS hardware implementation is not available")
        return ADCSState(
            timestamp=datetime.now(UTC).timestamp(),
            position_mcmf=[1737400, 0, 100000],
            velocity_mps=[0, 1600, 0],
            attitude_quaternion=[1, 0, 0, 0],
        )


class CommandADCS:
    def __init__(self, command: str) -> None:
        self.command = command

    def available(self) -> bool:
        return True

    def get_state(self) -> ADCSState:
        result = subprocess.run(self.command, shell=True, check=True, capture_output=True, text=True)
        return ADCSState.model_validate(json.loads(result.stdout))


def build_adcs_provider(settings: EdgeSettings) -> ADCSProvider:
    if settings.adcs_source == "command" and settings.adcs_command:
        return CommandADCS(settings.adcs_command or "")
    return MockADCS(available=settings.edge_mode == "mock")
