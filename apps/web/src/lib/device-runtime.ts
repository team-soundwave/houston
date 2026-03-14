import type { DeviceRecord } from "../types";

type DeviceDetails = Record<string, unknown>;

export function deviceDetails(device: DeviceRecord): DeviceDetails {
  return device.details ?? {};
}

export function deviceMode(device: DeviceRecord): string {
  const details = deviceDetails(device);
  return String(details.edge_mode ?? device.mode ?? "unknown");
}

export function captureSource(device: DeviceRecord): string {
  return String(deviceDetails(device).capture_source ?? "unknown");
}

export function adcsSource(device: DeviceRecord): string {
  return String(deviceDetails(device).adcs_source ?? "unknown");
}

export function captureInterval(device: DeviceRecord): number | null {
  const value = deviceDetails(device).capture_interval_seconds;
  return typeof value === "number" ? value : null;
}

export function capturingEnabled(device: DeviceRecord): boolean | null {
  const value = deviceDetails(device).capturing_enabled;
  return typeof value === "boolean" ? value : null;
}

export function nextCaptureDueAt(device: DeviceRecord): string | null {
  const value = deviceDetails(device).next_capture_due_at;
  return typeof value === "string" ? value : null;
}

export function adcsAvailable(device: DeviceRecord): boolean | null {
  const value = deviceDetails(device).adcs_available;
  return typeof value === "boolean" ? value : null;
}

export function bridgeWatchDir(device: DeviceRecord): string | null {
  const value = deviceDetails(device).bridge_watch_dir;
  return typeof value === "string" ? value : null;
}
