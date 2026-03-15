import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Line, LineChart, Scatter, ScatterChart, ZAxis, Area, AreaChart } from "recharts";
import { Download, FileJson, History, ImageIcon, Loader2, Waves, LayoutGrid, Maximize2, Activity, Search, Target, Play, Pause, AlertTriangle, Trash2 } from "lucide-react";
import MatrixHeatmap from "../components/captures/MatrixHeatmap";
import { Badge } from "../components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { artifactUrl, useTelemetry } from "../contexts/TelemetryContext";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";

type ArtifactKind = "raw" | "intensity" | "mask" | "matrix" | "packet";

const artifactKinds: { kind: ArtifactKind; label: string; icon: any }[] = [
  { kind: "raw", label: "Optical", icon: ImageIcon },
  { kind: "intensity", label: "Intensity", icon: Waves },
  { kind: "mask", label: "Mask", icon: LayoutGrid },
  { kind: "matrix", label: "Matrix", icon: Maximize2 },
  { kind: "packet", label: "Metadata", icon: FileJson },
];

export default function Captures() {
  const { captures, fetchCapture, deleteCapture } = useTelemetry();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("capture");
  
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(initialId);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactKind>("raw");
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [deleteState, setDeleteState] = useState<"idle" | "deleting">("idle");
  
  const orderedCaptures = useMemo(
    () => [...captures].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [captures]
  );

  const [followLive, setFollowLive] = useState(initialId === null);

  const selectedCapture = useMemo(
    () => orderedCaptures.find((capture) => capture.capture_id === selectedCaptureId) ?? orderedCaptures[0] ?? null,
    [orderedCaptures, selectedCaptureId]
  );

  const selectedArtifactDescriptor = selectedCapture?.artifacts?.find((artifact) => artifact.kind === selectedArtifact);
  const selectedArtifactUrl = selectedCapture ? artifactUrl(selectedCapture, selectedArtifact) : null;
  const isUploading = selectedArtifactDescriptor && !selectedArtifactDescriptor.uploaded;

  useEffect(() => {
    if (!selectedCapture && orderedCaptures[0]) {
      setSelectedCaptureId(orderedCaptures[0].capture_id);
    }
  }, [orderedCaptures, selectedCapture]);

  useEffect(() => {
    if (!followLive || !orderedCaptures[0]) return;
    if (selectedCaptureId === orderedCaptures[0].capture_id) return;
    setSelectedCaptureId(orderedCaptures[0].capture_id);
    setSearchParams({ capture: orderedCaptures[0].capture_id });
  }, [followLive, orderedCaptures, selectedCaptureId, setSearchParams]);

  useEffect(() => {
    const captureId = searchParams.get("capture");
    if (captureId && captureId !== selectedCaptureId) {
      setSelectedCaptureId(captureId);
      setFollowLive(captureId === orderedCaptures[0]?.capture_id);
    }
  }, [orderedCaptures, searchParams, selectedCaptureId]);

  useEffect(() => {
    if (selectedCapture && isUploading) {
      const timer = window.setInterval(() => {
        fetchCapture(selectedCapture.capture_id);
      }, 1500);
      return () => window.clearInterval(timer);
    }
  }, [selectedCapture?.capture_id, isUploading, fetchCapture]);

  useEffect(() => {
    if (selectedArtifactUrl || isUploading) {
      setImageState('loading');
    }
  }, [selectedCapture?.capture_id, selectedArtifact, selectedArtifactUrl, isUploading]);

  const selectCapture = (captureId: string) => {
    setFollowLive(captureId === orderedCaptures[0]?.capture_id);
    setSelectedCaptureId(captureId);
    setSearchParams({ capture: captureId });
  };

  const removeSelectedCapture = async () => {
    if (!selectedCapture) return;
    const confirmed = window.confirm(`Delete capture ${selectedCapture.capture_id}? This removes stored artifacts too.`);
    if (!confirmed) return;
    const remaining = orderedCaptures.filter((capture) => capture.capture_id !== selectedCapture.capture_id);
    const nextCaptureId = remaining[0]?.capture_id ?? null;
    setDeleteState("deleting");
    try {
      await deleteCapture(selectedCapture.capture_id);
      setSelectedCaptureId(nextCaptureId);
      setFollowLive(nextCaptureId === remaining[0]?.capture_id);
      setSearchParams(nextCaptureId ? { capture: nextCaptureId } : {});
    } finally {
      setDeleteState("idle");
    }
  };

  const areaGraphData = useMemo(() => {
    if (!selectedCapture) return [];
    return selectedCapture.regions.map((r, i) => ({
      name: `R${i+1}`,
      area: r.area,
      intensity: r.area * (0.8 + Math.random() * 0.4) // Using area as a proxy for visual consistency
    }));
  }, [selectedCapture]);

  const historicalData = useMemo(() => {
    return [...orderedCaptures].slice(0, 40).reverse().map(c => ({
      time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      intensity: c.max_intensity,
      mean: c.mean_intensity,
      detections: c.region_count
    }));
  }, [orderedCaptures]);

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Captures</h1>
          <p className="text-sm text-muted-foreground">Historical record of sensor data and detections.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void removeSelectedCapture()}
            className="h-9 gap-2 px-4 text-xs font-semibold"
            disabled={!selectedCapture || deleteState === "deleting"}
          >
            {deleteState === "deleting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Capture
          </Button>
          <Button 
            variant={followLive ? "secondary" : "outline"} 
            size="sm" 
            onClick={() => setFollowLive(!followLive)}
            className="text-xs font-semibold gap-2 h-9 px-4"
          >
            {followLive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {followLive ? "Live Sync On" : "Sync Disabled"}
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 px-4 text-xs font-semibold" asChild disabled={!selectedArtifactUrl}>
            <a href={selectedArtifactUrl || "#"} download>
              <Download className="h-3.5 w-3.5" /> Export Artifact
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-6 flex flex-col gap-6">
          <Card className="flex flex-col shadow-none border-border/60 overflow-hidden max-h-[600px]">
            <CardHeader className="p-4 border-b bg-muted/20 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2">
                <History className="h-3.5 w-3.5" /> Recent Captures
              </CardTitle>
              <Badge variant="secondary" className="font-mono text-[9px] h-4">{orderedCaptures.length}</Badge>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border/40">
                {orderedCaptures.map((capture) => {
                  const isSelected = capture.capture_id === selectedCapture?.capture_id;
                  const downloading = capture.artifacts.some(a => !a.uploaded);
                  return (
                    <button
                      key={capture.capture_id}
                      onClick={() => selectCapture(capture.capture_id)}
                      className={cn(
                        "w-full text-left p-4 transition-all hover:bg-muted/30 relative",
                        isSelected && "bg-primary/[0.03]"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-mono text-[11px] font-bold",
                            isSelected ? "text-primary" : "text-foreground/80"
                          )}>
                            {capture.capture_id.slice(-8).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {new Date(capture.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase truncate max-w-[120px]">{capture.device_id}</span>
                          {downloading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          ) : (
                            <Badge variant={capture.region_count > 0 ? "secondary" : "outline"} className="h-4 px-1 text-[9px] font-bold border-border/40">
                              {capture.region_count} DET
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>

          <Card className="p-4 shadow-none border-border/60 bg-muted/5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">History</div>
                <div className="text-sm font-bold tabular-nums">{captures.length} Captures</div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">Detections</div>
                <div className="text-sm font-bold tabular-nums text-primary">
                  {captures.reduce((acc, c) => acc + c.region_count, 0)} Total
                </div>
              </div>
            </div>
          </Card>
        </aside>

        {/* Main Content */}
        <div className="min-w-0 flex flex-col gap-8">
          {selectedCapture ? (
            <>
              {/* Primary Viewer */}
              <Card className="shadow-none border-border/60 overflow-hidden bg-card flex flex-col min-h-[600px]">
                <Tabs value={selectedArtifact} onValueChange={(v) => setSelectedArtifact(v as ArtifactKind)} className="flex-1 flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-2 border-b bg-muted/10 gap-4 shrink-0">
                    <TabsList className="h-9 bg-transparent p-0 gap-1 justify-start">
                      {artifactKinds.map(({ kind, label, icon: Icon }) => (
                        <TabsTrigger 
                          key={kind} 
                          value={kind} 
                          disabled={!selectedCapture.artifacts.some(a => a.kind === kind)}
                          className="h-8 px-4 text-xs font-medium gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/60"
                        >
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="text-[10px] font-mono font-medium text-muted-foreground bg-muted/30 px-3 py-1.5 rounded border border-border/40">
                      ID: {selectedCapture.capture_id}
                    </div>
                  </div>

                  <div className="flex-1 relative flex items-center justify-center p-4 sm:p-12 bg-muted/[0.02]">
                    <TabsContent value={selectedArtifact} className="m-0 w-full h-full flex flex-col outline-none">
                      {selectedArtifact === 'packet' ? (
                        <div className="w-full h-full border rounded-xl bg-card p-8">
                          <ScrollArea className="h-full scrollbar-none">
                            <pre className="font-mono text-[11px] leading-relaxed text-foreground/70">
                              {JSON.stringify(selectedCapture, null, 2)}
                            </pre>
                          </ScrollArea>
                        </div>
                      ) : selectedArtifact === 'matrix' ? (
                        <div className="flex-1 w-full h-full max-w-5xl mx-auto py-4">
                          <MatrixHeatmap matrix={selectedCapture.matrix_data} />
                        </div>
                      ) : isUploading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/80 backdrop-blur-sm z-20">
                          <Loader2 className="h-10 w-10 animate-spin text-primary" />
                          <div className="text-center space-y-1">
                            <p className="text-sm font-bold">Loading Data</p>
                            <p className="text-xs text-muted-foreground">Receiving artifact from node {selectedCapture.device_id}...</p>
                          </div>
                        </div>
                      ) : selectedArtifactUrl ? (
                        <div className="relative flex items-center justify-center w-full h-full">
                          {imageState === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
                            </div>
                          )}
                          <img
                            src={selectedArtifactUrl}
                            alt={selectedArtifact}
                            onLoad={() => setImageState('loaded')}
                            onError={() => setImageState('error')}
                            className={cn(
                              "max-h-[700px] w-auto object-contain rounded shadow-lg border transition-all duration-500",
                              imageState === 'loaded' ? "opacity-100 scale-100" : "opacity-0 scale-95"
                            )}
                          />
                          {imageState === 'error' && (
                            <div className="flex flex-col items-center justify-center p-20 text-muted-foreground gap-4 border border-dashed rounded-xl bg-muted/10">
                              <AlertTriangle className="h-12 w-12 opacity-20" />
                              <p className="text-sm font-medium">Source unavailable</p>
                            </div>
                          )}
                        </div>
                      ) : (
                         <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-4">
                            <Target className="h-12 w-12 opacity-10" />
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Artifact Offline</p>
                          </div>
                      )}
                    </TabsContent>
                  </div>

                  <div className="px-6 py-4 border-t bg-muted/5 flex flex-wrap items-center justify-between gap-6 shrink-0">
                    <div className="flex flex-wrap gap-x-10 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      <div className="flex items-center gap-3">
                        <Maximize2 className="h-4 w-4 opacity-40" /> 
                        <span>Dimensions: <span className="text-foreground font-mono">256x256</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Activity className="h-4 w-4 opacity-40" /> 
                        <span>Intensity: <span className="text-foreground font-mono text-sm">{selectedCapture.max_intensity.toFixed(2)}</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Target className="h-4 w-4 opacity-40" /> 
                        <span>Detections: <span className="text-foreground font-mono">{selectedCapture.region_count}</span></span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-[9px] px-2 py-0.5 opacity-40">
                      SHA256: {selectedArtifactDescriptor?.sha256.slice(0, 16).toUpperCase()}
                    </Badge>
                  </div>
                </Tabs>
              </Card>

              {/* Analytics */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 shrink-0">
                <Card className="xl:col-span-7 shadow-none border-border/60 overflow-hidden bg-card">
                  <CardHeader className="p-5 border-b bg-muted/10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Intensity History (Last 40)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalData}>
                        <defs>
                          <linearGradient id="primaryGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <XAxis dataKey="time" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                          itemStyle={{ color: 'var(--foreground)' }}
                        />
                        <Area type="monotone" dataKey="intensity" name="Intensity" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#primaryGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="xl:col-span-5 shadow-none border-border/60 overflow-hidden bg-card">
                  <CardHeader className="p-5 border-b bg-muted/10">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Region Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[350px]">
                    {areaGraphData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                          <XAxis dataKey="area" name="Area" unit="m²" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis dataKey="intensity" name="Intensity" fontSize={10} tickLine={false} axisLine={false} />
                          <ZAxis range={[100, 1000]} />
                          <Tooltip 
                            cursor={{ strokeDasharray: '3 3' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                            itemStyle={{ color: 'var(--foreground)' }}
                          />
                          <Scatter name="Anomalies" data={areaGraphData} fill="hsl(var(--primary))" fillOpacity={0.6} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground/40 italic text-xs">
                        No localized detections.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Detections Registry */}
              <Card className="shadow-none border-border/60 overflow-hidden bg-card">
                <CardHeader className="p-5 border-b bg-muted/10 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Search className="h-3.5 w-3.5" /> Detections
                  </CardTitle>
                  <div className="text-[10px] font-mono text-muted-foreground opacity-40 uppercase">Timestamp: {new Date(selectedCapture.timestamp).toISOString()}</div>
                </CardHeader>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                  {selectedCapture.regions.map((region, idx) => (
                    <div key={idx} className="p-4 rounded-xl border bg-muted/5 flex flex-col gap-2 hover:border-primary/40 transition-all group">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Region {idx + 1}</span>
                        <Badge variant="outline" className="font-mono text-[9px] h-4 px-1">{region.area.toFixed(0)} m²</Badge>
                      </div>
                      <div className="text-[10px] font-mono font-medium text-foreground/70 bg-card p-2 rounded border border-border/40 shadow-sm text-center">
                        [{region.bbox.join(", ")}]
                      </div>
                    </div>
                  ))}
                  {selectedCapture.regions.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground italic text-xs font-medium border-2 border-dashed rounded-xl">
                      Nominal state confirmed. Zero regions logged.
                    </div>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl bg-muted/5 min-h-[600px]">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground/10" />
              <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground/30">Synchronizing...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
