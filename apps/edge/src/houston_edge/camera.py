from __future__ import annotations

from itertools import cycle
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from .config import EdgeSettings


class FrameSource(Protocol):
    def capture_array(self) -> np.ndarray: ...
    def available(self) -> bool: ...
    def close(self) -> None: ...


class SimulatorFrameSource:
    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.frame_index = 0

    def capture_array(self) -> np.ndarray:
        x = np.linspace(0, 1, self.width, dtype=np.float32)
        y = np.linspace(0, 1, self.height, dtype=np.float32)
        xv, yv = np.meshgrid(x, y)
        gradient = 40 + 80 * xv + 20 * np.sin((yv * 6) + (self.frame_index * 0.25))
        image = np.stack([gradient * 0.7, gradient * 0.8, gradient], axis=2)
        for offset in range(4):
            cx = int((0.15 + ((self.frame_index * 0.03) + (offset * 0.19)) % 0.7) * self.width)
            cy = int((0.2 + ((self.frame_index * 0.04) + (offset * 0.13)) % 0.6) * self.height)
            cv2.circle(image, (cx, cy), 16 + (offset * 6), (180 + offset * 15, 210 + offset * 8, 250), -1)
        self.frame_index += 1
        noise = np.random.normal(0, 10, size=image.shape)
        return np.clip(image + noise, 0, 255).astype(np.uint8)

    def available(self) -> bool:
        return True

    def close(self) -> None:
        return None


class DirectoryFrameSource:
    def __init__(self, sample_dir: Path) -> None:
        files = _load_images(sample_dir)
        if not files:
            raise ValueError(f"no sample images found in {sample_dir}")
        self._images = cycle(files)

    def capture_array(self) -> np.ndarray:
        path = next(self._images)
        image = cv2.imread(str(path))
        if image is None:
            raise RuntimeError(f"failed to read sample image: {path}")
        return image

    def available(self) -> bool:
        return True

    def close(self) -> None:
        return None


class PicameraFrameSource:
    def __init__(self, width: int, height: int, exposure_time_usec: int) -> None:
        self.width = width
        self.height = height
        self.exposure_time_usec = exposure_time_usec
        self._camera = None

    def capture_array(self) -> np.ndarray:
        return self._ensure_camera().capture_array()

    def available(self) -> bool:
        try:
            self._ensure_camera()
        except Exception:
            return False
        return True

    def close(self) -> None:
        if self._camera is not None:
            self._camera.stop()
            self._camera = None

    def _ensure_camera(self):
        if self._camera is not None:
            return self._camera
        try:
            from picamera2 import Picamera2
        except ImportError as exc:
            raise RuntimeError("picamera2 is required for capture_source=picamera") from exc
        camera = Picamera2()
        config = camera.create_still_configuration(
            main={"size": (self.width, self.height)},
            controls={"ExposureTime": self.exposure_time_usec},
        )
        camera.configure(config)
        camera.start()
        self._camera = camera
        return camera


def build_frame_source(settings: EdgeSettings) -> FrameSource:
    if settings.capture_source == "directory" and settings.sample_image_dir is not None:
        return DirectoryFrameSource(settings.sample_image_dir)
    if settings.capture_source == "picamera":
        return PicameraFrameSource(
            width=settings.image_width,
            height=settings.image_height,
            exposure_time_usec=settings.exposure_time_usec,
        )
    return SimulatorFrameSource(settings.image_width, settings.image_height)


def _load_images(sample_dir: Path) -> list[Path]:
    if not sample_dir.exists():
        return []
    files: list[Path] = []
    for pattern in ("*.png", "*.jpg", "*.jpeg"):
        files.extend(sorted(sample_dir.glob(pattern)))
    return files
