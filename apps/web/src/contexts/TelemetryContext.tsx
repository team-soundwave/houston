import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { CaptureRecord, DeviceRecord, EventRecord, CommandRecord } from "../types";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_GROUND_HTTP_BASE ?? "http://127.0.0.1:8000";
const wsBase = import.meta.env.VITE_GROUND_WS_URL ?? "ws://127.0.0.1:8000/ws/ui";

function upsertByKey<T extends Record<string, unknown>>(items: T[], item: T, key: keyof T): T[] {
  const next = [...items];
  const index = next.findIndex((candidate) => candidate[key] === item[key]);
  if (index >= 0) {
    next[index] = item;
    return next;
  }
  return [item, ...next];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

export function artifactUrl(capture: CaptureRecord, kind: string): string | null {
  const artifact = capture.artifacts?.find((c) => c.kind === kind && c.url);
  return artifact?.url ? `${apiBase}${artifact.url}` : null;
}

function commandFromEvent(data: Record<string, unknown>): CommandRecord | null {
  const issued = data.command as Record<string, unknown> | undefined;
  if (issued?.command_id && issued.device_id && issued.kind && issued.issued_at) {
    return {
      command_id: String(issued.command_id),
      device_id: String(issued.device_id),
      kind: String(issued.kind),
      args: (issued.args as Record<string, unknown> | undefined) ?? {},
      state: "sent",
      created_at: String(issued.issued_at),
    };
  }

  const result = data.result as Record<string, unknown> | undefined;
  if (result?.command_id && result.device_id && result.emitted_at) {
    return {
      command_id: String(result.command_id),
      device_id: String(result.device_id),
      kind: "command",
      args: {},
      state: result.ok ? "completed" : "failed",
      created_at: String(result.emitted_at),
      completed_at: String(result.emitted_at),
      result,
    };
  }

  return null;
}

interface TelemetryContextType {
  devices: DeviceRecord[];
  captures: CaptureRecord[];
  events: EventRecord[];
  commands: CommandRecord[];
  commandError: string | null;
  socketConnected: boolean;
  systemTime: string;
  issueCommand: (deviceId: string, kind: string, args?: Record<string, unknown>) => Promise<void>;
  fetchCapture: (captureId: string) => Promise<CaptureRecord>;
  clearError: () => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [systemTime, setSystemTime] = useState(new Date().toISOString());

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => setSystemTime(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setDevices([]);
      setCaptures([]);
      setEvents([]);
      setCommands([]);
      setSocketConnected(false);
      return;
    }

    void Promise.all([
      apiFetch<DeviceRecord[]>("/api/devices"),
      apiFetch<CaptureRecord[]>("/api/captures"),
      apiFetch<EventRecord[]>("/api/events"),
    ]).then(([deviceData, captureData, eventData]) => {
      setDevices(deviceData);
      setCaptures(captureData);
      setEvents(eventData);
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = new WebSocket(wsBase);
    socket.onopen = () => setSocketConnected(true);
    socket.onclose = () => setSocketConnected(false);
    socket.onerror = () => setSocketConnected(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as Record<string, unknown>;
      if (message.type === "snapshot") {
        const payload = message.payload as { devices: DeviceRecord[]; captures: CaptureRecord[]; events: EventRecord[] };
        setDevices(payload.devices);
        setCaptures(payload.captures);
        setEvents(payload.events);
        return;
      }
      const topic = String(message.topic ?? "system");
      const emitted_at = String(message.emitted_at ?? new Date().toISOString());
      const data = (message.data as Record<string, unknown>) ?? {};
      
      const newEvent: EventRecord = { topic, emitted_at, data };
      setEvents((current) => [newEvent, ...current].slice(0, 500));

      if (topic === "device" && data.device_id) {
        setDevices((c) => upsertByKey(c, data as unknown as DeviceRecord, "device_id"));
      }
      
      if (topic === "capture" && data.capture_id) {
        const capture = data as unknown as CaptureRecord;
        setCaptures((c) => {
          const isNew = !c.some((existing) => existing.capture_id === capture.capture_id);
          if (isNew) {
            toast.info(`New transmission detected`, {
              description: `Receiving data for ${capture.capture_id.slice(-8)} from ${capture.device_id}...`,
            });
          }
          return upsertByKey(c, capture, "capture_id");
        });
      }

      if (topic === "command") {
        const cmd = commandFromEvent(data);
        if (!cmd) return;
        setCommands((current) => {
          const existing = current.find((entry) => entry.command_id === cmd.command_id);
          const merged = existing ? { ...existing, ...cmd, kind: existing.kind !== "command" ? existing.kind : cmd.kind } : cmd;
          return upsertByKey(current, merged, "command_id").slice(0, 100);
        });
        if (cmd.state === "completed") toast.success(`Command ${cmd.kind} completed on ${cmd.device_id}`);
        if (cmd.state === "failed") toast.error(`Command ${cmd.kind} failed on ${cmd.device_id}`);
      }
    };
    return () => socket.close();
  }, [isAuthenticated]);

  const issueCommand = useCallback(async (deviceId: string, kind: string, args: Record<string, unknown> = {}) => {
    setCommandError(null);
    try {
      const promise = apiFetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ kind, args }),
      });
      
      toast.promise(promise, {
        loading: `Sending ${kind} to ${deviceId}...`,
        success: `Sent ${kind} successfully`,
        error: (err) => `Failed to send command: ${err.message}`,
      });

      const response = await promise as { command_id: string; issued_at: string; device_id: string; kind: string; args?: Record<string, unknown> };
      setCommands((current) =>
        upsertByKey(
          current,
          {
            command_id: response.command_id,
            device_id: response.device_id,
            kind: response.kind,
            args: response.args ?? args,
            state: "queued",
            created_at: response.issued_at,
          },
          "command_id"
        ).slice(0, 100)
      );
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Command Failed");
    }
  }, [token]);

  const fetchCapture = useCallback(async (captureId: string) => {
    const data = await apiFetch<CaptureRecord>(`/api/captures/${captureId}`);
    setCaptures((c) => upsertByKey(c, data, "capture_id"));
    return data;
  }, []);

  const clearError = useCallback(() => {
    setCommandError(null);
  }, []);

  return (
    <TelemetryContext.Provider value={{ devices, captures, events, commands, commandError, socketConnected, systemTime, issueCommand, fetchCapture, clearError }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);
  if (context === undefined) {
    throw new Error("useTelemetry must be used within a TelemetryProvider");
  }
  return context;
}
