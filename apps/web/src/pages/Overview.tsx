import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Database, Satellite, Waves, Clock, Activity, ImageIcon, Maximize2, ExternalLink, Loader2, CloudDownload, Zap, BarChart3, SignalHigh } from "lucide-react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { artifactUrl, useTelemetry } from "../contexts/TelemetryContext";
import { captureInterval, capturingEnabled, deviceMode, nextCaptureDueAt } from "../lib/device-runtime";
import { buildLinkMetrics, formatBytes, JPEG_COMPRESSION_RATIO } from "../lib/link-metrics";
import MatrixHeatmap from "../components/captures/MatrixHeatmap";
import { cn } from "../lib/utils";
import { useState, useEffect, useMemo } from "react";

export default function Overview() {
  const { devices, captures, socketConnected, systemTime, fetchCapture } = useTelemetry();
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const now = new Date(systemTime);
  const orderedCaptures = [...captures].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
  const onlineDevices = devices.filter((device) => device.connected);
  const primaryDevice = onlineDevices[0] ?? devices[0] ?? null;
  const latestCapture = orderedCaptures[0] ?? null;
  const nextCapture = primaryDevice ? nextCaptureDueAt(primaryDevice) : null;
  const isCapturing = primaryDevice ? capturingEnabled(primaryDevice) : false;
  const linkMetrics = buildLinkMetrics(captures, devices);
  const transferBytesFromRaw = (capture: typeof latestCapture) => {
    if (!capture) return 0;
    const rawArtifact = capture.artifacts?.find((artifact) => artifact.kind === "raw");
    if (!rawArtifact) return 0;
    return Math.round(rawArtifact.size_bytes * (1 - JPEG_COMPRESSION_RATIO));
  };
  
  const nextCaptureMs = nextCapture ? new Date(nextCapture).getTime() - now.getTime() : null;
  const nextCaptureLabel =
    nextCaptureMs === null
      ? "--:--"
      : nextCaptureMs <= 0
        ? "Now"
        : `${Math.floor(nextCaptureMs / 60000)}m ${Math.floor((nextCaptureMs % 60000) / 1000)}s`;

  const opticalUrl = latestCapture ? artifactUrl(latestCapture, "raw") : null;
  const rawArtifact = latestCapture?.artifacts?.find(a => a.kind === "raw");
  const isUploading = rawArtifact && !rawArtifact.uploaded;

  // Derive throughput history from recent captures
  const linkHistory = useMemo(() => {
    return [...orderedCaptures].slice(0, 20).reverse().map(c => ({
      time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      size: transferBytesFromRaw(c) / 1024,
      dets: c.region_count
    }));
  }, [orderedCaptures]);

  const trendData = [...orderedCaptures].slice(0, 10).reverse().map(c => ({
    time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    intensity: c.max_intensity,
    objects: c.region_count
  }));

  // AUTO-POLL: If latest is uploading, refresh it
  useEffect(() => {
    if (latestCapture && isUploading) {
      const timer = window.setInterval(() => {
        fetchCapture(latestCapture.capture_id);
      }, 1500);
      return () => window.clearInterval(timer);
    }
  }, [latestCapture?.capture_id, isUploading, fetchCapture]);

  useEffect(() => {
    if (opticalUrl || isUploading) {
      setImageState('loading');
    }
  }, [latestCapture?.capture_id, opticalUrl, isUploading]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Overview</h1>
          <p className="text-sm text-muted-foreground font-medium">Network status and latest transmission telemetry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={socketConnected ? "outline" : "destructive"} className="px-2.5 py-1 gap-2 font-bold text-[10px] uppercase tracking-wider">
            <div className={cn("w-1.5 h-1.5 rounded-full", socketConnected ? "bg-emerald-500" : "bg-destructive")} />
            Ground Link: {socketConnected ? "Connected" : "Offline"}
          </Badge>
          <Badge variant="outline" className="px-2.5 py-1 gap-2 font-bold text-[10px] uppercase tracking-wider">
            Active Nodes: {onlineDevices.length} / {devices.length}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-12">
        {/* Main Content */}
        <div className="xl:col-span-8 space-y-6 min-w-0">
          <Card className="shadow-none border-border/60">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0 pb-4 border-b bg-muted/10">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold uppercase tracking-tight">Latest Uplink</CardTitle>
                <CardDescription className="text-[10px] font-mono font-bold opacity-60">
                  {latestCapture ? latestCapture.capture_id : "NO_DATA_INGEST"}
                </CardDescription>
              </div>
              {latestCapture && (
                <Button variant="outline" size="sm" className="h-8 gap-2 text-[10px] font-bold uppercase tracking-wider" asChild>
                  <Link to={`/captures?capture=${latestCapture.capture_id}`}>
                    Report Details <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {latestCapture ? (
                <Tabs defaultValue="optical" className="w-full">
                  <div className="px-4 py-2 border-b bg-muted/5 flex items-center justify-between">
                    <TabsList className="h-8 bg-transparent p-0 gap-1">
                      <TabsTrigger value="optical" className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider gap-2">
                        <ImageIcon className="h-3 w-3" /> Optical
                      </TabsTrigger>
                      <TabsTrigger value="heatmap" className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider gap-2">
                        <Maximize2 className="h-3 w-3" /> Heatmap
                      </TabsTrigger>
                    </TabsList>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 opacity-60 hidden sm:block">
                      Peak Flux: {latestCapture.max_intensity.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-4 sm:p-6 space-y-6">
                    <div className="aspect-video relative rounded-lg border bg-muted/20 overflow-hidden flex items-center justify-center shadow-inner">
                      <TabsContent value="optical" className="m-0 w-full h-full flex items-center justify-center outline-none">
                        {isUploading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted/10">
                            <CloudDownload className="h-10 w-10 text-primary animate-bounce opacity-40" />
                            <div className="text-center">
                              <p className="text-xs font-bold uppercase tracking-widest">Synchronizing Payload</p>
                              <p className="text-[10px] text-muted-foreground mt-1">Awaiting artifact verified upload...</p>
                            </div>
                          </div>
                        ) : opticalUrl ? (
                          <>
                            {imageState === 'loading' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                              </div>
                            )}
                            <img 
                              src={opticalUrl} 
                              alt="optical-sensor" 
                              onLoad={() => setImageState('loaded')}
                              onError={() => setImageState('error')}
                              className={cn(
                                "max-h-full max-w-full object-contain transition-opacity duration-300",
                                imageState === 'loaded' ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {imageState === 'error' && (
                              <div className="text-xs text-muted-foreground text-center p-4">
                                <AlertTriangle className="h-5 w-5 mx-auto mb-2 opacity-50" />
                                Source Offline
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">Optical source map pending ingest</div>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="heatmap" className="m-0 w-full h-full outline-none p-4">
                        <MatrixHeatmap matrix={latestCapture.matrix_data} />
                      </TabsContent>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg border bg-muted/5">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Total Hits</div>
                        <div className="text-xl font-bold tracking-tight">{latestCapture.region_count}</div>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/5">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Max Intensity</div>
                        <div className="text-xl font-bold tracking-tight">{latestCapture.max_intensity.toFixed(2)}</div>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/5">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Ingest Delay</div>
                        <div className="text-sm font-bold pt-1 truncate">
                          {formatDistanceToNow(new Date(latestCapture.timestamp), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Tabs>
              ) : (
                <div className="py-32 text-center">
                  <Database className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/40">Searching for broadcast signal...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Link Telemetry Graph */}
          <Card className="shadow-none border-border/60 overflow-hidden bg-card">
            <CardHeader className="p-4 border-b bg-muted/10 flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" /> Link Telemetry & Throughput
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold">LIVE_INGEST</Badge>
            </CardHeader>
            <CardContent className="p-6 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={linkHistory}>
                  <defs>
                    <linearGradient id="linkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                  <XAxis dataKey="time" fontSize={9} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}KB`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid var(--border)', background: 'var(--card)' }}
                  />
                  <Area type="monotone" dataKey="size" name="Payload Size" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#linkGrad)" />
                  <Line type="step" dataKey="dets" name="Hit Density" stroke="rgba(100,116,139,0.4)" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-4 bg-muted/10 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Node Stats</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {primaryDevice ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs p-2.5 rounded border bg-card shadow-sm">
                    <span className="text-muted-foreground font-bold uppercase tracking-tight">Identifier</span>
                    <span className="font-mono font-bold text-foreground">{primaryDevice.device_id}</span>
                  </div>
                  
                  <div className="space-y-2 px-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-bold uppercase tracking-tight">Ops Mode</span>
                      <span className="font-bold text-foreground">{deviceMode(primaryDevice)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-bold uppercase tracking-tight">Stream</span>
                      <span className={cn("font-bold", isCapturing ? "text-emerald-600" : "text-muted-foreground")}>
                        {isCapturing ? "BROADCASTING" : "SUSPENDED"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-bold uppercase tracking-tight">Cycle</span>
                      <span className="font-bold text-foreground">{captureInterval(primaryDevice)}s</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Next Uplink</span>
                      <Badge variant="secondary" className="font-mono font-bold text-xs h-6">{nextCaptureLabel}</Badge>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" className="w-full text-[10px] font-bold uppercase tracking-widest h-9" asChild>
                    <Link to="/devices">Node Configuration</Link>
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground italic font-medium">No active node constellations.</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none border-border/60">
            <CardHeader className="pb-4 bg-muted/10 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                Link Metrics <SignalHigh className="h-3.5 w-3.5" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {[
                { label: "Uplink (raw + JPEG)", value: formatBytes(linkMetrics.uplinkBytes) },
                { label: "Downlink (est.)", value: formatBytes(linkMetrics.downlinkBytes) },
                { label: "Queued Outbound", value: formatBytes(linkMetrics.pendingBytes) },
                { label: "Transfer Rate", value: `${formatBytes(linkMetrics.estimatedBytesPerSecond)}/s`, color: "text-emerald-600" },
              ].map((m, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{m.label}</span>
                  <span className={cn("font-mono text-xs font-bold", m.color)}>{m.value}</span>
                </div>
              ))}
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.18em]">Budget Breakdown</div>
                <div className="mt-2 grid gap-2 text-xs">
                  <div className="flex justify-between">
                    <span>Raw source</span>
                    <span className="font-mono">{formatBytes(linkMetrics.rawSourceBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Compression savings ({Math.round(linkMetrics.compressionRatio * 100)}%)</span>
                    <span className="font-mono">{formatBytes(linkMetrics.rawSavingsBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bandwidth scope</span>
                    <span className="font-mono">raw only</span>
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest">
                  <span>Last Handshake</span>
                  <span>{primaryDevice?.last_seen_at ? formatDistanceToNow(new Date(primaryDevice.last_seen_at), { addSuffix: true }) : "Never"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
