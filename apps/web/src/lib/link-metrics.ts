import type { CaptureRecord, DeviceRecord } from "../types";

export const JPEG_COMPRESSION_RATIO = 0.9;
const JPEG_TRANSFER_RATIO = 1 - JPEG_COMPRESSION_RATIO;
const METADATA_BYTES_PER_CAPTURE = 512;
const HEARTBEAT_BYTES_PER_DEVICE = 128;

export type LinkMetrics = {
  uploadedBytes: number;
  pendingBytes: number;
  rawSourceBytes: number;
  compressionRatio: number;
  rawSavingsBytes: number;
  rawUploads: number;
  rawPendings: number;
  uploadedArtifacts: number;
  pendingArtifacts: number;
  excludedUploadedBytes: number;
  excludedPendingBytes: number;
  estimatedBytesPerSecond: number;
  queueDepth: number;
  uplinkBytes: number;
  downlinkBytes: number;
};

const safeParseDate = (value: string): number => {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
};

const getRawArtifact = (capture: CaptureRecord) => capture.artifacts?.find((artifact) => artifact.kind === "raw");
const getTransferBytes = (size: number) => Math.max(0, Math.round(size * JPEG_TRANSFER_RATIO));

export function buildLinkMetrics(captures: CaptureRecord[], devices: DeviceRecord[]): LinkMetrics {
  let uploadedBytes = 0;
  let pendingBytes = 0;
  let rawSourceBytes = 0;
  let rawSavingsBytes = 0;
  let rawUploads = 0;
  let rawPendings = 0;
  let uploadedArtifacts = 0;
  let pendingArtifacts = 0;
  let excludedUploadedBytes = 0;
  let excludedPendingBytes = 0;
  const uploadedRawSamples: Array<{ timestamp: number; bytes: number }> = [];

  for (const capture of captures) {
    const rawArtifact = getRawArtifact(capture);
    const rawSize = rawArtifact?.size_bytes ?? 0;

    if (rawArtifact) {
      rawSourceBytes += rawSize;
      const transferredBytes = getTransferBytes(rawSize);
      if (rawArtifact.uploaded) {
        uploadedBytes += transferredBytes;
        uploadedArtifacts += 1;
        rawUploads += 1;
        uploadedRawSamples.push({
          timestamp: safeParseDate(capture.timestamp),
          bytes: transferredBytes,
        });
      } else {
        pendingBytes += transferredBytes;
        pendingArtifacts += 1;
        rawPendings += 1;
      }
      rawSavingsBytes += Math.max(0, rawSize - transferredBytes);
    }

    for (const artifact of capture.artifacts ?? []) {
      if (artifact.kind === "raw") {
        continue;
      }
      if (artifact.uploaded) {
        excludedUploadedBytes += artifact.size_bytes;
      } else {
        excludedPendingBytes += artifact.size_bytes;
      }
    }
  }

  const queueDepth = devices.reduce((sum, device) => sum + device.queue_depth, 0);
  const recentUploadedRaw = [...uploadedRawSamples]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12)
    .sort((a, b) => a.timestamp - b.timestamp);

  let estimatedBytesPerSecond = 0;
  if (recentUploadedRaw.length >= 2) {
    const oldest = recentUploadedRaw[0].timestamp;
    const newest = recentUploadedRaw[recentUploadedRaw.length - 1].timestamp;
    const seconds = Math.max((newest - oldest) / 1000, 1);
    const bytes = recentUploadedRaw.reduce((sum, sample) => sum + sample.bytes, 0);
    estimatedBytesPerSecond = bytes / seconds;
  }

  const rawCaptureCount = captures.filter((capture) => getRawArtifact(capture)).length;
  const connectedDevices = devices.filter((device) => device.connected).length;
  const downlinkBytes = Math.max(
    0,
    rawCaptureCount * METADATA_BYTES_PER_CAPTURE + connectedDevices * HEARTBEAT_BYTES_PER_DEVICE
  );
  const uplinkBytes = uploadedBytes + pendingBytes;

  return {
    uploadedBytes,
    pendingBytes,
    rawSourceBytes,
    compressionRatio: JPEG_COMPRESSION_RATIO,
    rawUploads,
    rawPendings,
    rawSavingsBytes,
    uploadedArtifacts,
    pendingArtifacts,
    excludedUploadedBytes,
    excludedPendingBytes,
    estimatedBytesPerSecond,
    queueDepth,
    uplinkBytes,
    downlinkBytes,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
