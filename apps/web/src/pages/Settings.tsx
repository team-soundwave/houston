import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useTelemetry } from "../contexts/TelemetryContext";
import { adcsAvailable, adcsSource, bridgeWatchDir, captureInterval, captureSource, capturingEnabled, deviceMode, nextCaptureDueAt } from "../lib/device-runtime";
import { buildLinkMetrics, formatBytes } from "../lib/link-metrics";
import { groundHttpBase, groundWsBase } from "../lib/runtime-url";
import { BadgeCheck, Download, Upload } from "lucide-react";

const apiBase = groundHttpBase();
const wsBase = groundWsBase();

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
          <CardDescription>
            Single-image uplink model: only the raw image per capture is counted for payload transfer. JPEG compression is applied before link accounting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Uplink (compressed)</div>
              <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.uplinkBytes)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Raw image bytes after JPEG model</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Downlink (estimated)</div>
              <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.downlinkBytes)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Control plane + status telemetry</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Estimated Throughput</div>
              <div className="mt-1 text-xl font-semibold">{formatBytes(linkMetrics.estimatedBytesPerSecond)}/s</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Queue Depth</div>
              <div className="mt-1 text-xl font-semibold">{linkMetrics.queueDepth}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Compression Ratio</div>
              <div className="mt-1 text-xl font-semibold">{Math.round(linkMetrics.compressionRatio * 100)}%</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Image bytes saved: {formatBytes(linkMetrics.rawSavingsBytes)}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                <span>Single-image Source</span>
                <Upload className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 text-lg font-semibold">{formatBytes(linkMetrics.rawSourceBytes)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{linkMetrics.rawUploads + linkMetrics.rawPendings} raw captures in feed</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                <span>Raw Transfer Status</span>
                <Download className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 text-lg font-semibold">
                {formatBytes(linkMetrics.uploadedBytes)} / {formatBytes(linkMetrics.pendingBytes)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">uploaded / pending (uplink queue)</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                <span>Payload Breakdown</span>
                <BadgeCheck className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 text-sm">
                <p className="text-[11px] leading-6 text-muted-foreground">
                  Excluded from uplink:
                </p>
                <p className="mt-1 text-xs">
                  intensity/mask/matrix/packet: {formatBytes(linkMetrics.excludedUploadedBytes + linkMetrics.excludedPendingBytes)}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase text-muted-foreground">Breakdown: Downlink</div>
              <div className="mt-1 text-sm">
                <div className="flex justify-between py-1">
                  <span>Capture metadata</span>
                  <span className="font-mono">{formatBytes((linkMetrics.downlinkBytes / Math.max(linkMetrics.rawUploads + linkMetrics.rawPendings, 1) * 0.85) || 0)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Heartbeats/ack</span>
                  <span className="font-mono">{formatBytes((linkMetrics.downlinkBytes / Math.max(linkMetrics.rawUploads + linkMetrics.rawPendings, 1) * 0.15) || 0)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <span>Total downlink estimate</span>
                  <span className="font-mono font-bold">{formatBytes(linkMetrics.downlinkBytes)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4 md:col-span-2">
              <div className="text-xs uppercase text-muted-foreground">How bandwidth is being counted</div>
              <div className="mt-1 text-sm text-muted-foreground">
                <p>
                  Every capture contributes one raw image artifact to uplink accounting.
                  Non-raw artifacts (intensity, mask, matrix, packet, etc.) are out of scope
                  for payload transfer and are shown above as excluded bytes.
                </p>
                <p className="mt-2">
                  Total transfer model used: <span className="font-semibold text-foreground">Uplink = source raw image × 10% JPEG transfer + Downlink estimate</span>.
                </p>
              </div>
            </div>
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
