from __future__ import annotations

import shutil
from pathlib import Path


class Storage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save_artifact(self, device_id: str, capture_id: str, filename: str, content: bytes) -> Path:
        target_dir = self.root / device_id / capture_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / filename
        target.write_bytes(content)
        return target

    def artifact_url(self, device_id: str, capture_id: str, filename: str) -> str:
        return f"/artifacts/{device_id}/{capture_id}/{filename}"

    def delete_capture(self, device_id: str, capture_id: str) -> None:
        target_dir = self.root / device_id / capture_id
        if target_dir.exists():
            shutil.rmtree(target_dir)
