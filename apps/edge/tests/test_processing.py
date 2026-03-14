from datetime import UTC, datetime

import numpy as np
import pytest

from houston_edge.artifacts import build_capture_bundle
from houston_edge.config import EdgeSettings
from houston_edge.processing import compress_matrix, compute_dust_intensity, detect_dust_regions
from houston_protocol.messages import ADCSState


def test_compress_matrix_handles_zero_frame() -> None:
    intensity = np.zeros((1080, 1920), dtype=np.uint8)
    matrix = compress_matrix(intensity)
    assert matrix.shape == (36, 64)
    assert float(matrix.max()) == 0.0


def test_processing_pipeline_produces_region_and_artifacts() -> None:
    image = np.zeros((1080, 1920, 3), dtype=np.uint8)
    image[300:340, 400:440] = 255
    intensity = compute_dust_intensity(image)
    mask, regions = detect_dust_regions(intensity, threshold=20, minimum_region_area=20)
    matrix = compress_matrix(intensity)
    bundle = build_capture_bundle(
        capture_id="test-capture",
        captured_at=datetime(2026, 3, 14, tzinfo=UTC),
        adcs_state=ADCSState(
            timestamp=1.0,
            position_mcmf=[1, 2, 3],
            velocity_mps=[4, 5, 6],
            attitude_quaternion=[1, 0, 0, 0],
        ),
        image=image,
        intensity=intensity,
        mask=mask,
        matrix=matrix,
        regions=regions,
    )

    assert regions
    assert bundle.packet.region_count >= 1
    assert {artifact.kind.value for artifact in bundle.packet.artifacts} == {"raw", "intensity", "mask", "matrix", "packet"}
    assert len(bundle.packet.matrix_data) == 36
    assert len(bundle.packet.matrix_data[0]) == 64


def test_real_mode_requires_real_sources() -> None:
    with pytest.raises(ValueError):
        EdgeSettings(edge_mode="real", capture_source="simulator", adcs_source="mock")

    settings = EdgeSettings(edge_mode="real", capture_source="picamera", adcs_source="mock")
    bridge_settings = EdgeSettings(
        edge_mode="real",
        capture_source="bridge",
        adcs_source="mock",
        bridge_watch_dir="/tmp",
    )

    assert settings.edge_mode == "real"
    assert bridge_settings.capture_source == "bridge"
