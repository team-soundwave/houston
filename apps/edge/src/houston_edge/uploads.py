from __future__ import annotations

import httpx

from .config import EdgeSettings
from .spool import SpoolManifest, SpoolStore


class ArtifactUploader:
    def __init__(self, settings: EdgeSettings, spool: SpoolStore, http_client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.spool = spool
        self.http_client = http_client

    async def upload_manifest(self, manifest: SpoolManifest) -> None:
        for artifact in manifest.artifacts:
            if artifact.uploaded:
                continue
            content = await self.spool.load_artifact(manifest.capture.capture_id, artifact.filename)
            response = await self.http_client.post(
                f"{self.settings.ground_http_url}/api/edge/artifacts/{manifest.capture.capture_id}/{artifact.kind.value}",
                params={"device_id": self.settings.device_id, "sha256": artifact.sha256},
                files={"file": (artifact.filename, content, artifact.content_type)},
            )
            response.raise_for_status()
            await self.spool.mark_uploaded(manifest.capture.capture_id, artifact.kind)
