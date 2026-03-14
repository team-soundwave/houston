from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from io import BytesIO

import cv2
import numpy as np

from houston_protocol.messages import ADCSState, ArtifactDescriptor, ArtifactKind, CapturePacket, Region


@dataclass
class ArtifactBlob:
    kind: ArtifactKind
    filename: str
    content_type: str
    data: bytes

    @property
    def size_bytes(self) -> int:
        return len(self.data)

    @property
    def digest(self) -> str:
        return sha256(self.data).hexdigest()


@dataclass
class CaptureBundle:
    packet: CapturePacket
    artifacts: list[ArtifactBlob]


def artifact_blob(kind: ArtifactKind, filename: str, content_type: str, data: bytes) -> ArtifactBlob:
    return ArtifactBlob(kind=kind, filename=filename, content_type=content_type, data=data)


def build_capture_bundle(
    capture_id: str,
    captured_at: datetime,
    adcs_state: ADCSState,
    image: np.ndarray,
    intensity: np.ndarray,
    mask: np.ndarray,
    matrix: np.ndarray,
    regions: list[dict],
) -> CaptureBundle:
    artifacts = [
        _png_artifact(ArtifactKind.RAW, f"{capture_id}_raw.png", image),
        _png_artifact(ArtifactKind.INTENSITY, f"{capture_id}_intensity.png", intensity),
        _png_artifact(ArtifactKind.MASK, f"{capture_id}_mask.png", mask),
        _matrix_artifact(f"{capture_id}_matrix.npy", matrix),
    ]
    packet = CapturePacket(
        capture_id=capture_id,
        timestamp=captured_at,
        adcs=adcs_state,
        regions=[Region.model_validate(region) for region in regions],
        matrix_shape=list(matrix.shape),
        matrix_data=matrix.tolist(),
        region_count=len(regions),
        max_intensity=float(np.max(intensity)),
        mean_intensity=float(np.mean(intensity)),
        artifacts=[_descriptor(artifact) for artifact in artifacts],
    )
    packet_json = packet.model_dump_json(indent=2).encode("utf-8")
    artifacts.append(
        ArtifactBlob(
            kind=ArtifactKind.PACKET,
            filename=f"{capture_id}_packet.json",
            content_type="application/json",
            data=packet_json,
        )
    )
    packet.artifacts.append(_descriptor(artifacts[-1]))
    return CaptureBundle(packet=packet, artifacts=artifacts)


def _descriptor(artifact: ArtifactBlob) -> ArtifactDescriptor:
    return ArtifactDescriptor(
        kind=artifact.kind,
        filename=artifact.filename,
        content_type=artifact.content_type,
        size_bytes=artifact.size_bytes,
        sha256=artifact.digest,
    )


def _png_artifact(kind: ArtifactKind, filename: str, image: np.ndarray) -> ArtifactBlob:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError(f"failed to encode artifact {filename}")
    return ArtifactBlob(kind=kind, filename=filename, content_type="image/png", data=encoded.tobytes())


def _matrix_artifact(filename: str, matrix: np.ndarray) -> ArtifactBlob:
    buffer = BytesIO()
    np.save(buffer, matrix)
    return ArtifactBlob(
        kind=ArtifactKind.MATRIX,
        filename=filename,
        content_type="application/octet-stream",
        data=buffer.getvalue(),
    )
