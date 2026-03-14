import json
from datetime import UTC, datetime

import cv2
import numpy as np

from houston_edge.bridge import BridgeIngestor
from houston_edge.config import EdgeSettings


def test_bridge_ingests_existing_cubesat_capture(tmp_path) -> None:
    capture_id = "capture_20260314_120000"
    image = np.zeros((48, 64, 3), dtype=np.uint8)
    image[10:18, 22:30] = 255
    intensity = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = (intensity > 0).astype(np.uint8) * 255
    matrix = np.ones((36, 64), dtype=np.float32)
    packet = {
        "timestamp": "20260314_120000",
        "adcs": {
            "timestamp": 1.0,
            "position_mcmf": [1, 2, 3],
            "velocity_mps": [4, 5, 6],
            "attitude_quaternion": [1, 0, 0, 0],
        },
        "regions": [{"bbox": [22, 10, 8, 8], "area": 64.0}],
        "matrix_shape": [36, 64],
    }
    cv2.imwrite(str(tmp_path / f"{capture_id}_raw.png"), image)
    cv2.imwrite(str(tmp_path / f"{capture_id}_intensity.png"), intensity)
    cv2.imwrite(str(tmp_path / f"{capture_id}_mask.png"), mask)
    np.save(tmp_path / f"{capture_id}_matrix.npy", matrix)
    (tmp_path / f"{capture_id}_packet.json").write_text(json.dumps(packet), encoding="utf-8")
    settings = EdgeSettings(capture_source="bridge", bridge_watch_dir=tmp_path, spool_dir=tmp_path / "spool")
    bridge = BridgeIngestor(settings)

    assert bridge.poll() == []
    bundles = bridge.poll()

    assert len(bundles) == 1
    assert bundles[0].packet.capture_id == capture_id
    assert bundles[0].packet.timestamp == datetime(2026, 3, 14, 12, 0, tzinfo=UTC)
