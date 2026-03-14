import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Camera, CheckCircle2, ChevronDown, ChevronUp, Cpu, Server, Settings2, Activity } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useTelemetry } from "../contexts/TelemetryContext";
import { captureInterval, captureSource, capturingEnabled, deviceMode } from "../lib/device-runtime";
import { cn } from "../lib/utils";
import type { CommandRecord, DeviceRecord } from "../types";

function relativeTime(value?: string | null): string {
  return value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "Never";
}

function DeviceRow({
  device,
  commands,
  onCommand,
}: {
  device: DeviceRecord;
  commands: CommandRecord[];
  onCommand: (deviceId: string, kind: string, args?: Record<string, unknown>) => Promise<void>;
}) {
  const [showControls, setShowControls] = useState(false);
  const [interval, setInterval] = useState("");
  const isCapturing = capturingEnabled(device);

  return (
    <>
      <TableRow className="group">
        <TableCell className="font-mono font-bold text-sm">{device.device_id}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", device.connected ? "bg-emerald-500" : "bg-muted-foreground/30")} />
            <span className="text-xs font-medium uppercase tracking-tight">
              {device.connected ? "Connected" : "Offline"}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/30">
            {deviceMode(device)}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {relativeTime(device.last_seen_at)}
        </TableCell>
        <TableCell className="text-xs font-medium">
          {isCapturing ? `${captureInterval(device)}s` : "Stopped"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 text-xs px-3"
              disabled={!device.connected}
              onClick={() => onCommand(device.device_id, isCapturing ? "stop_capture" : "start_capture")}
            >
              {isCapturing ? "Stop" : "Start"}
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 w-8 p-0"
              onClick={() => setShowControls(!showControls)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {showControls && (
        <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
          <TableCell colSpan={6} className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Configuration</div>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5 flex-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Capture Interval (seconds)</label>
                    <Input 
                      value={interval} 
                      onChange={(e) => setInterval(e.target.value)} 
                      placeholder={String(captureInterval(device) || "30")}
                      className="h-9 text-xs"
                    />
                  </div>
                  <Button 
                    size="sm" 
                    disabled={!device.connected || !interval} 
                    onClick={() => {
                      onCommand(device.device_id, "set_interval", { seconds: Number(interval) });
                      setInterval("");
                    }}
                  >
                    Update
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8"
                    disabled={!device.connected}
                    onClick={() => onCommand(device.device_id, "request_snapshot")}
                  >
                    <Camera className="h-3.5 w-3.5 mr-2" /> Manual Snapshot
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Diagnostics</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Software Version</span>
                    <span className="font-mono">{device.software_version || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Queue Depth</span>
                    <span className="font-mono">{device.queue_depth} packets</span>
                  </div>
                  <div className="flex justify-between text-xs text-destructive">
                    <span className="text-muted-foreground">Latest Error</span>
                    <span className="font-medium truncate max-w-[200px]">{device.last_error || "None"}</span>
                  </div>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Devices() {
  const { devices, commands, issueCommand } = useTelemetry();
  const onlineCount = devices.filter((device) => device.connected).length;

  const commandsByDevice = useMemo(
    () =>
      devices.reduce<Record<string, CommandRecord[]>>((acc, device) => {
        acc[device.device_id] = commands.filter((command) => command.device_id === device.device_id);
        return acc;
      }, {}),
    [devices, commands]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Node Management</h1>
          <p className="text-sm text-muted-foreground">Monitor and configure edge sensor constellations.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Active Nodes</div>
            <div className="text-lg font-bold">{onlineCount} / {devices.length}</div>
          </div>
        </div>
      </div>

      <Card className="shadow-none border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Node ID</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Mode</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Last Heartbeat</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Interval</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => (
              <DeviceRow
                key={device.device_id}
                device={device}
                commands={commandsByDevice[device.device_id] ?? []}
                onCommand={issueCommand}
              />
            ))}
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic text-sm">
                  No devices connected to the ground link.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
