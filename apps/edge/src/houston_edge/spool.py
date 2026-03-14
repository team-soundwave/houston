from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from houston_protocol.messages import ArtifactDescriptor, ArtifactKind, CapturePacket

from .artifacts import CaptureBundle


class SpoolManifest(BaseModel):
    capture: CapturePacket
    artifacts: list[ArtifactDescriptor] = Field(default_factory=list)
    created_at: datetime


class SpoolStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.pending_dir = root / "pending"
        self.uploaded_dir = root / "uploaded"
        self.pending_dir.mkdir(parents=True, exist_ok=True)
        self.uploaded_dir.mkdir(parents=True, exist_ok=True)

    async def save_capture(self, bundle: CaptureBundle) -> SpoolManifest:
        return await self._to_thread(self._save_capture_sync, bundle)

    async def list_pending(self) -> list[SpoolManifest]:
        return await self._to_thread(self._list_pending_sync)

    async def queue_depth(self) -> int:
        manifests = await self.list_pending()
        return len(manifests)

    async def load_artifact(self, capture_id: str, filename: str) -> bytes:
        return await self._to_thread((self.pending_dir / capture_id / filename).read_bytes)

    async def mark_uploaded(self, capture_id: str, kind: ArtifactKind) -> None:
        await self._to_thread(self._mark_uploaded_sync, capture_id, kind)

    async def latest_manifests(self, limit: int = 10) -> list[SpoolManifest]:
        return await self._to_thread(self._latest_manifests_sync, limit)

    def _save_capture_sync(self, bundle: CaptureBundle) -> SpoolManifest:
        capture_dir = self.pending_dir / bundle.packet.capture_id
        capture_dir.mkdir(parents=True, exist_ok=True)
        artifacts = []
        for artifact in bundle.artifacts:
            (capture_dir / artifact.filename).write_bytes(artifact.data)
            artifacts.append(
                ArtifactDescriptor(
                    kind=artifact.kind,
                    filename=artifact.filename,
                    content_type=artifact.content_type,
                    size_bytes=artifact.size_bytes,
                    sha256=artifact.digest,
                )
            )

        manifest = SpoolManifest(
            capture=bundle.packet,
            artifacts=artifacts,
            created_at=datetime.now(UTC),
        )
        (capture_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
        return manifest

    def _list_pending_sync(self) -> list[SpoolManifest]:
        manifests = []
        for manifest_path in sorted(self.pending_dir.glob("*/manifest.json"), reverse=True):
            manifests.append(SpoolManifest.model_validate_json(manifest_path.read_text(encoding="utf-8")))
        return manifests

    def _latest_manifests_sync(self, limit: int) -> list[SpoolManifest]:
        manifests = self._list_pending_sync()
        uploaded = []
        for manifest_path in sorted(self.uploaded_dir.glob("*/manifest.json"), reverse=True):
            uploaded.append(SpoolManifest.model_validate_json(manifest_path.read_text(encoding="utf-8")))
        combined = sorted(manifests + uploaded, key=lambda item: item.created_at, reverse=True)
        return combined[:limit]

    def _mark_uploaded_sync(self, capture_id: str, kind: ArtifactKind) -> None:
        capture_dir = self.pending_dir / capture_id
        manifest_path = capture_dir / "manifest.json"
        if not manifest_path.exists():
            return
        manifest = SpoolManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
        for artifact in manifest.artifacts:
            if artifact.kind == kind:
                artifact.uploaded = True
        manifest_path.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
        if all(artifact.uploaded for artifact in manifest.artifacts):
            destination = self.uploaded_dir / capture_id
            if destination.exists():
                shutil.rmtree(destination)
            shutil.move(str(capture_dir), str(destination))

    async def _to_thread(self, func, *args):
        import asyncio

        return await asyncio.to_thread(func, *args)
