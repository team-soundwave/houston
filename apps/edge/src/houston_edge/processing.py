from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def compute_dust_intensity(image: np.ndarray) -> np.ndarray:
    """Mirror the original cubesat/main.py brightness anomaly pipeline."""

    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    background = cv2.GaussianBlur(blurred, (31, 31), 0)
    anomaly = cv2.subtract(blurred, background)
    normalized = cv2.normalize(anomaly, None, 0, 255, cv2.NORM_MINMAX)
    return cv2.convertScaleAbs(normalized, alpha=1.8, beta=0)


def detect_dust_regions(
    intensity: np.ndarray,
    threshold: int,
    minimum_region_area: int,
) -> tuple[np.ndarray, list[dict[str, Any]]]:
    _, mask = cv2.threshold(intensity, threshold, 255, cv2.THRESH_BINARY)
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions: list[dict[str, Any]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < minimum_region_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        regions.append({"bbox": [int(x), int(y), int(w), int(h)], "area": float(area)})
    return mask, regions


def compress_matrix(intensity: np.ndarray) -> np.ndarray:
    matrix = cv2.resize(intensity, (64, 36)).astype(np.float32)
    max_value = float(np.max(matrix))
    if max_value > 0:
        matrix = matrix / max_value
    return matrix
