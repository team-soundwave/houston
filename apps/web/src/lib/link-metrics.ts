import type { CaptureRecord, DeviceRecord } from "../types";

export type LinkMetrics = {
  uploadedBytes: number;
  pendingBytes: number;
  uploadedArtifacts: number;
  pendingArtifacts: number;
  estimatedBytesPerSecond: number;
  queueDepth: number;
};

export function buildLinkMetrics(captures: CaptureRecord[], devices: DeviceRecord[]): LinkMetrics {
  let uploadedBytes = 0;
  let pendingBytes = 0;
  let uploadedArtifacts = 0;
  let pendingArtifacts = 0;

  for (const capture of captures) {
    for (const artifact of capture.artifacts ?? []) {
      if (artifact.uploaded) {
        uploadedBytes += artifact.size_bytes;
        uploadedArtifacts += 1;
      } else {
        pendingBytes += artifact.size_bytes;
        pendingArtifacts += 1;
      }
    }
  }

  const queueDepth = devices.reduce((sum, device) => sum + device.queue_depth, 0);
  const recentCaptures = captures
    .filter((capture) => capture.artifacts?.some((artifact) => artifact.uploaded))
    .slice(0, 12);

  let estimatedBytesPerSecond = 0;
  if (recentCaptures.length >= 2) {
    const newest = new Date(recentCaptures[0].timestamp).getTime();
    const oldest = new Date(recentCaptures[recentCaptures.length - 1].timestamp).getTime();
    const seconds = Math.max((newest - oldest) / 1000, 1);
    const bytes = recentCaptures.reduce(
      (sum, capture) =>
        sum + capture.artifacts.filter((artifact) => artifact.uploaded).reduce((inner, artifact) => inner + artifact.size_bytes, 0),
      0
    );
    estimatedBytesPerSecond = bytes / seconds;
  }

  return {
    uploadedBytes,
    pendingBytes,
    uploadedArtifacts,
    pendingArtifacts,
    estimatedBytesPerSecond,
    queueDepth,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
