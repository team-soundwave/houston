export type DeviceStatus = "idle" | "capturing" | "stopped" | "error";

export type Artifact = {
  kind: "raw" | "intensity" | "mask" | "matrix" | "packet";
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  uploaded: boolean;
  url?: string | null;
};

export type Region = {
  bbox: number[];
  area: number;
};

export type DeviceRecord = {
  device_id: string;
  connected: boolean;
  status: DeviceStatus;
  camera_available: boolean;
  queue_depth: number;
  software_version?: string | null;
  last_seen_at?: string | null;
  last_capture_at?: string | null;
  last_error?: string | null;
  mode?: string; // "real", "mock", "bridge"
  capabilities?: string[];
  interval?: number;
  anomaly_threshold?: number;
  min_region_area?: number;
  details?: Record<string, unknown>;
};

export type CaptureRecord = {
  capture_id: string;
  device_id: string;
  timestamp: string;
  region_count: number;
  max_intensity: number;
  mean_intensity: number;
  matrix_data?: number[][];
  artifacts: Artifact[];
  regions: Region[];
  state?: "processing" | "uploaded" | "partial" | "complete";
};

export type EventRecord = {
  topic: string;
  emitted_at: string;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type CommandRecord = {
  command_id: string;
  device_id: string;
  kind: string;
  args?: Record<string, unknown>;
  state: "queued" | "pending" | "sent" | "completed" | "failed";
  created_at: string;
  completed_at?: string;
  result?: unknown;
};

export type User = {
  username: string;
  role: "admin" | "operator" | "observer";
  last_login?: string;
};

export type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};
