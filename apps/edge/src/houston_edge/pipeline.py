from __future__ import annotations

from datetime import UTC, datetime

from .adcs import ADCSProvider, build_adcs_provider
from .artifacts import CaptureBundle, build_capture_bundle
from .camera import FrameSource, build_frame_source
from .config import EdgeSettings
from .processing import compress_matrix, compute_dust_intensity, detect_dust_regions


class CapturePipeline:
    def __init__(
        self,
        settings: EdgeSettings,
        frame_source: FrameSource | None = None,
        adcs_provider: ADCSProvider | None = None,
    ) -> None:
        self.settings = settings
        self.frame_source = frame_source or build_frame_source(settings)
        self.adcs = adcs_provider or build_adcs_provider(settings)

    def close(self) -> None:
        self.frame_source.close()

    def camera_available(self) -> bool:
        return self.frame_source.available()

    def adcs_available(self) -> bool:
        return self.adcs.available()

    def update_thresholds(self, threshold: int | None = None, minimum_region_area: int | None = None) -> None:
        if threshold is not None:
            self.settings.anomaly_threshold = threshold
        if minimum_region_area is not None:
            self.settings.minimum_region_area = minimum_region_area

    def run_capture(self, capture_id: str) -> CaptureBundle:
        captured_at = datetime.now(UTC)
        adcs_state = self.adcs.get_state()
        image = self.frame_source.capture_array()
        intensity = compute_dust_intensity(image)
        mask, regions = detect_dust_regions(
            intensity=intensity,
            threshold=self.settings.anomaly_threshold,
            minimum_region_area=self.settings.minimum_region_area,
        )
        matrix = compress_matrix(intensity)
        return build_capture_bundle(
            capture_id=capture_id,
            captured_at=captured_at,
            adcs_state=adcs_state,
            image=image,
            intensity=intensity,
            mask=mask,
            matrix=matrix,
            regions=regions,
        )
