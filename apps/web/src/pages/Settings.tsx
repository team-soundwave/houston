import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useTelemetry } from "../contexts/TelemetryContext";
import { adcsAvailable, adcsSource, bridgeWatchDir, captureInterval, captureSource, capturingEnabled, deviceMode, nextCaptureDueAt } from "../lib/device-runtime";
import { buildLinkMetrics, formatBytes } from "../lib/link-metrics";

const apiBase = import.meta.env.VITE_GROUND_HTTP_BASE ?? "http://127.0.0.1:8000";
const wsBase = import.meta.env.VITE_GROUND_WS_URL ?? "ws://127.0.0.1:8000/ws/ui";

export default function Settings() {
  const { devices, captures, socketConnected } = useTelemetry();
  const linkMetrics = buildLinkMetrics(captures, devices);

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Settings And Observability</CardTitle>
          <CardDescription>
            This page answers what environment you are connected to, what each edge device is actually running, and what the dashboard means by “online”.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Ground HTTP API</div>
            <div className="mt-2 break-all font-mono text-sm">{apiBase}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Ground UI WebSocket</div>
            <div className="mt-2 break-all font-mono text-sm">{wsBase}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Ground Telemetry Stream</div>
            <div className="mt-2">
              <Badge variant={socketConnected ? "success" : "destructive"}>
                {socketConnected ? "live" : "offline"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Link Telemetry</CardTitle>
          <CardDescription>Derived from artifact transfer state on the ground backend.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Uploaded Data</div>
            <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.uploadedBytes)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Pending Data</div>
            <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.pendingBytes)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Estimated Throughput</div>
            <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.estimatedBytesPerSecond)}/s</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Uploaded Artifacts</div>
            <div className="mt-1 text-xl font-semibold">{linkMetrics.uploadedArtifacts}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">Edge Queue Depth</div>
            <div className="mt-1 text-xl font-semibold">{linkMetrics.queueDepth}</div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {devices.map((device) => (
          <Card key={device.device_id} className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{device.device_id}</span>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={device.connected ? "success" : "secondary"}>{device.connected ? "edge online" : "edge offline"}</Badge>
                  <Badge variant={deviceMode(device) === "mock" ? "secondary" : "outline"}>{deviceMode(device)}</Badge>
                  <Badge variant="outline">{captureSource(device)}</Badge>
                </div>
              </CardTitle>
              <CardDescription>
                Software {device.software_version ?? "unknown"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">Capture Interval</div>
                <div className="mt-1 text-lg font-semibold">{captureInterval(device) ?? "--"}s</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">Capture Loop</div>
                <div className="mt-1 text-lg font-semibold">{capturingEnabled(device) === null ? "unknown" : capturingEnabled(device) ? "running" : "stopped"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">Next Expected Capture</div>
                <div className="mt-1 text-sm">{nextCaptureDueAt(device) ?? "Not scheduled / unknown"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">ADCS</div>
                <div className="mt-1 text-sm">{adcsSource(device)} / {String(adcsAvailable(device) ?? "unknown")}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">Bridge Watch Dir</div>
                <div className="mt-1 break-all text-sm">{bridgeWatchDir(device) ?? "n/a"}</div>
              </div>
              <div className="rounded-lg border p-3 md:col-span-2 xl:col-span-4">
                <div className="text-xs uppercase text-muted-foreground">Capabilities</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(device.capabilities ?? []).length > 0 ? (
                    (device.capabilities ?? []).map((capability) => (
                      <Badge key={capability} variant="outline">{capability}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No capability list reported.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {devices.length === 0 && (
          <Card className="shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No edge devices have registered with the ground backend yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
