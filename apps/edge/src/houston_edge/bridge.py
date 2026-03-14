from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np
from pydantic import BaseModel, Field

from houston_protocol.messages import ADCSState, ArtifactDescriptor, ArtifactKind, CapturePacket, Region

from .artifacts import CaptureBundle, artifact_blob
from .config import EdgeSettings


class BridgeState(BaseModel):
    processed: set[str] = Field(default_factory=set)


class BridgeIngestor:
    def __init__(self, settings: EdgeSettings) -> None:
        if settings.bridge_watch_dir is None:
            raise ValueError("bridge_watch_dir is required for capture_source=bridge")
        self.settings = settings
        self.watch_dir = settings.bridge_watch_dir
        self.state_path = settings.spool_dir / "bridge_state.json"
        self._sizes: dict[str, dict[str, int]] = {}
        self._state = self._load_state()

    def available(self) -> bool:
        return self.watch_dir.exists()

    def poll(self) -> list[CaptureBundle]:
        bundles = []
        for packet_path in sorted(self.watch_dir.glob("capture_*_packet.json")):
            capture_id = packet_path.stem.removesuffix("_packet")
            if capture_id in self._state.processed or not self._ready(packet_path, capture_id):
                continue
            bundles.append(self._load_bundle(packet_path, capture_id))
            self._state.processed.add(capture_id)
            self._write_state()
        return bundles

    def _ready(self, packet_path: Path, capture_id: str) -> bool:
        paths = self._artifact_paths(packet_path, capture_id)
        if not all(path.exists() for path in paths.values()):
            return False
        sizes = {name: path.stat().st_size for name, path in paths.items()}
        previous = self._sizes.get(capture_id)
        self._sizes[capture_id] = sizes
        return previous == sizes

    def _load_bundle(self, packet_path: Path, capture_id: str) -> CaptureBundle:
        paths = self._artifact_paths(packet_path, capture_id)
        packet_data = json.loads(packet_path.read_text(encoding="utf-8"))
        matrix = np.load(paths["matrix"])
        intensity = cv2.imread(str(paths["intensity"]), cv2.IMREAD_GRAYSCALE)
        if intensity is None:
            raise RuntimeError(f"failed to read intensity image {paths['intensity']}")
        packet = CapturePacket(
            capture_id=capture_id,
            timestamp=_parse_timestamp(str(packet_data["timestamp"])),
            adcs=ADCSState.model_validate(packet_data["adcs"]),
            regions=[Region.model_validate(region) for region in packet_data.get("regions", [])],
            matrix_shape=list(matrix.shape),
            region_count=len(packet_data.get("regions", [])),
            max_intensity=float(np.max(intensity)),
            mean_intensity=float(np.mean(intensity)),
            artifacts=[self._descriptor(kind, paths[name]) for name, kind in _artifact_kinds().items() if name != "packet"],
        )
        artifacts = [self._blob(kind, paths[name]) for name, kind in _artifact_kinds().items()]
        return CaptureBundle(packet=packet, artifacts=artifacts)

    def _artifact_paths(self, packet_path: Path, capture_id: str) -> dict[str, Path]:
        base = packet_path.parent / capture_id
        return {
            "raw": base.with_name(f"{capture_id}_raw.png"),
            "intensity": base.with_name(f"{capture_id}_intensity.png"),
            "mask": base.with_name(f"{capture_id}_mask.png"),
            "matrix": base.with_name(f"{capture_id}_matrix.npy"),
            "packet": packet_path,
        }

    def _blob(self, kind: ArtifactKind, path: Path):
        return artifact_blob(kind, path.name, _content_type(kind), path.read_bytes())

    def _descriptor(self, kind: ArtifactKind, path: Path) -> ArtifactDescriptor:
        blob = self._blob(kind, path)
        return ArtifactDescriptor(
            kind=blob.kind,
            filename=blob.filename,
            content_type=blob.content_type,
            size_bytes=blob.size_bytes,
            sha256=blob.digest,
        )

    def _load_state(self) -> BridgeState:
        if self.state_path.exists():
            return BridgeState.model_validate_json(self.state_path.read_text(encoding="utf-8"))
        return BridgeState()

    def _write_state(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(self._state.model_dump_json(indent=2), encoding="utf-8")


def _artifact_kinds() -> dict[str, ArtifactKind]:
    return {
        "raw": ArtifactKind.RAW,
        "intensity": ArtifactKind.INTENSITY,
        "mask": ArtifactKind.MASK,
        "matrix": ArtifactKind.MATRIX,
        "packet": ArtifactKind.PACKET,
    }


def _content_type(kind: ArtifactKind) -> str:
    return {
        ArtifactKind.RAW: "image/png",
        ArtifactKind.INTENSITY: "image/png",
        ArtifactKind.MASK: "image/png",
        ArtifactKind.MATRIX: "application/octet-stream",
        ArtifactKind.PACKET: "application/json",
    }[kind]


def _parse_timestamp(value: str) -> datetime:
    for fmt in ("%Y%m%d_%H%M%S", "%Y%m%dT%H%M%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return datetime.fromisoformat(value).astimezone(UTC)
