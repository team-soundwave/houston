from __future__ import annotations

from datetime import UTC, datetime

import cv2

from .adcs import ADCSProvider, build_adcs_provider
from .artifacts import CaptureBundle, build_capture_bundle
from .camera import FrameSource, build_frame_source
from .config import EdgeSettings
from .processing import compress_matrix, compute_dust_intensity, detect_dust_regions
from houston_protocol.messages import ADCSState


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
        adcs_state = self._adcs_state(captured_at)
        image_bgr = self.frame_source.capture_array()
        image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
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

    def _adcs_state(self, captured_at: datetime) -> ADCSState:
        try:
            return self.adcs.get_state()
        except Exception:
            return ADCSState(
                timestamp=captured_at.timestamp(),
                position_mcmf=[0.0, 0.0, 0.0],
                velocity_mps=[0.0, 0.0, 0.0],
                attitude_quaternion=[1.0, 0.0, 0.0, 0.0],
            )
