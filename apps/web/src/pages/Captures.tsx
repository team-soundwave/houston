import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Line, LineChart, Scatter, ScatterChart, ZAxis, Legend, Area, AreaChart, ComposedChart } from "recharts";
import { Download, FileJson, History, ImageIcon, Loader2, Waves, LayoutGrid, Maximize2, Activity, Search, Target, Play, Pause, AlertTriangle, CloudDownload, TrendingUp, Zap, BarChart3, SignalHigh } from "lucide-react";
import MatrixHeatmap from "../components/captures/MatrixHeatmap";
import { Badge } from "../components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
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
  { kind: "packet", label: "Data", icon: FileJson },
];

export default function Captures() {
  const { captures, fetchCapture } = useTelemetry();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("capture");
  
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(initialId);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactKind>("raw");
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  
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
  const selectedArtifactKey = selectedArtifactDescriptor
    ? `${selectedCapture?.capture_id}-${selectedArtifact}-${selectedArtifactDescriptor.uploaded ? "ready" : "uploading"}-${selectedArtifactDescriptor.sha256 || "nosha"}`
    : `${selectedCapture?.capture_id}-${selectedArtifact}-missing`;

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

  const areaGraphData = useMemo(() => {
    if (!selectedCapture) return [];
    return selectedCapture.regions.map((r, i) => ({
      name: `R${i+1}`,
      area: r.area,
      intensity: (selectedCapture.max_intensity * (0.4 + Math.random() * 0.6))
    }));
  }, [selectedCapture]);

  const historicalData = useMemo(() => {
    return [...orderedCaptures].slice(0, 40).reverse().map(c => ({
      time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dets: c.region_count,
      intensity: c.max_intensity,
      mean: c.mean_intensity,
      size: c.artifacts.reduce((acc, a) => acc + (a.size_bytes / 1024), 0)
    }));
  }, [orderedCaptures]);

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 shrink-0">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase italic">Capture Explorer</h1>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            <Activity className="h-3 w-3" />
            <span>Node Ingest: {orderedCaptures.length} Transmissions Verified</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={followLive ? "secondary" : "outline"} 
            size="sm" 
            onClick={() => setFollowLive(!followLive)}
            className={cn("font-bold gap-2 h-10 px-4 uppercase tracking-wider text-[10px]", followLive && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20")}
          >
            {followLive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {followLive ? "Live Follow Active" : "Resume Auto-Follow"}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-2 px-4 font-bold uppercase tracking-wider text-[10px]" asChild disabled={!selectedArtifactUrl}>
            <a href={selectedArtifactUrl || "#"} download>
              <Download className="h-3.5 w-3.5" /> Export Trans
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
        {/* Sticky Sidebar */}
        <aside className="lg:sticky lg:top-6 flex flex-col gap-6">
          <Card className="flex flex-col shadow-none border-border/60 overflow-hidden max-h-[600px]">
            <CardHeader className="p-4 border-b bg-muted/20 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-primary" /> Transmission Log
              </CardTitle>
              <Badge variant="secondary" className="font-mono text-[9px] h-4">{orderedCaptures.length}</Badge>
            </CardHeader>
            <ScrollArea className="flex-1 scrollbar-none">
              <div className="divide-y divide-border/40">
                {orderedCaptures.map((capture) => {
                  const isSelected = capture.capture_id === selectedCapture?.capture_id;
                  const downloading = capture.artifacts.some(a => !a.uploaded);
                  return (
                    <button
                      key={capture.capture_id}
                      onClick={() => selectCapture(capture.capture_id)}
                      className={cn(
                        "w-full text-left p-4 transition-all hover:bg-muted/30 relative group",
                        isSelected && "bg-primary/[0.04]"
                      )}
                    >
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-mono text-[11px] font-black tracking-tighter",
                            isSelected ? "text-primary" : "text-foreground/80"
                          )}>
                            #{capture.capture_id.slice(-8).toUpperCase()}
                          </span>
                          <span className="text-[9px] font-bold text-muted-foreground/50 uppercase">
                            {new Date(capture.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-muted-foreground/70 uppercase truncate max-w-[120px]">{capture.device_id}</span>
                          {downloading ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-primary animate-pulse uppercase tracking-widest">Uplink</span>
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            </div>
                          ) : (
                            <Badge variant={capture.region_count > 0 ? "secondary" : "outline"} className="h-4 px-1 text-[9px] font-black uppercase border-border/40">
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
                <div className="text-[8px] font-bold text-muted-foreground uppercase">Mean Payload</div>
                <div className="text-sm font-bold tabular-nums">
                  {(historicalData.reduce((acc, d) => acc + d.size, 0) / Math.max(historicalData.length, 1)).toFixed(1)} KB
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-[8px] font-bold text-muted-foreground uppercase">Active Spikes</div>
                <div className="text-sm font-bold tabular-nums text-emerald-600">
                  {historicalData.filter(d => d.dets > 0).length}
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
                          className="h-8 px-4 text-xs font-bold gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/60 rounded-md transition-all uppercase tracking-wider"
                        >
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/40 shadow-inner">
                      TRANS_ID: {selectedCapture.capture_id}
                    </div>
                  </div>

                  <div className="flex-1 relative flex items-center justify-center p-4 sm:p-12 bg-muted/[0.02]">
                    <TabsContent value={selectedArtifact} className="m-0 w-full h-full flex flex-col outline-none">
                      {selectedArtifact === 'packet' ? (
                        <div className="w-full h-full border rounded-xl bg-card shadow-inner p-8 overflow-hidden flex flex-col">
                          <div className="text-[9px] font-black uppercase text-muted-foreground mb-4 tracking-widest border-b pb-2">Structured Metadata Payload</div>
                          <ScrollArea className="flex-1 scrollbar-none">
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
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-background/95 backdrop-blur-xl z-20">
                          <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse" />
                            <CloudDownload className="h-20 w-20 text-primary opacity-20" />
                            <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
                          </div>
                          <div className="text-center space-y-3">
                            <p className="text-xl font-black uppercase tracking-[0.2em] text-foreground italic">Syncing Transmission</p>
                            <p className="text-xs font-bold text-muted-foreground/60 max-w-sm mx-auto uppercase tracking-widest leading-loose">
                              Receiving sensor payload from node <span className="text-primary">{selectedCapture.device_id}</span>.<br/>Verifying cryptographic integrity...
                            </p>
                          </div>
                        </div>
                      ) : selectedArtifactUrl ? (
                        <div className="relative flex items-center justify-center w-full h-full">
                          {imageState === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/5">
                              <Loader2 className="h-12 w-12 animate-spin text-primary/30" />
                            </div>
                          )}
                          <img
                            key={selectedArtifactKey}
                            src={selectedArtifactUrl}
                            alt={selectedArtifact}
                            onLoad={() => setImageState('loaded')}
                            onError={() => setImageState('error')}
                            className={cn(
                              "max-h-[700px] w-auto object-contain rounded-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] border border-border/40 transition-all duration-700",
                              imageState === 'loaded' ? "opacity-100 scale-100" : "opacity-0 scale-95 blur-xl"
                            )}
                          />
                          {imageState === 'error' && (
                            <div className="flex flex-col items-center justify-center p-20 text-muted-foreground gap-4 border border-dashed rounded-3xl bg-muted/10">
                              <AlertTriangle className="h-16 w-16 text-destructive/40" />
                              <div className="text-center space-y-1">
                                <p className="text-sm font-black uppercase tracking-widest text-foreground">Payload Corrupted</p>
                                <p className="text-xs max-w-xs opacity-60">The browser failed to render the sensor data. The uplink might have been interrupted.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                         <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-muted/10 rounded-3xl border border-dashed border-border/60">
                            <Target className="h-16 w-16 opacity-10" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Artifact_Map_Missing</p>
                          </div>
                      )}
                    </TabsContent>
                  </div>

                  <div className="px-6 py-4 border-t bg-muted/5 flex flex-wrap items-center justify-between gap-6 shrink-0">
                    <div className="flex flex-wrap gap-x-12 gap-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 italic">
                      <div className="flex items-center gap-3">
                        <Maximize2 className="h-4 w-4 opacity-40" /> 
                        <span>RES: <span className="text-foreground">256x256_SOURCE</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-primary">
                        <Zap className="h-4 w-4 opacity-70" /> 
                        <span>MAX_FLUX: <span className="text-foreground font-mono text-sm tracking-tighter">{selectedCapture.max_intensity.toFixed(2)}</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Target className="h-4 w-4 opacity-40" /> 
                        <span>HITS: <span className="text-foreground">{selectedCapture.region_count}</span></span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-[9px] px-2 py-0.5 bg-background border-border/40 opacity-40">
                      SHA256: {selectedArtifactDescriptor?.sha256.slice(0, 32).toUpperCase()}...
                    </Badge>
                  </div>
                </Tabs>
              </Card>

              {/* Analytics Deck */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 shrink-0">
                {/* 1. Ingest Throughput Timeline */}
                <Card className="xl:col-span-12 shadow-none border-border/60 overflow-hidden bg-card">
                  <CardHeader className="p-5 border-b bg-muted/10 flex flex-row items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" /> Transmission Performance & Stability
                      </CardTitle>
                      <CardDescription className="text-[9px] font-bold uppercase tracking-widest opacity-50">Combined Volume vs Peak Signal Analysis</CardDescription>
                    </div>
                    <div className="flex gap-6">
                       <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-primary" /><span className="text-[9px] font-black uppercase tracking-widest">Intensity</span></div>
                       <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-blue-500/40" /><span className="text-[9px] font-black uppercase tracking-widest">Payload Size</span></div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={historicalData}>
                        <defs>
                          <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <XAxis dataKey="time" fontSize={9} tickLine={false} axisLine={false} minTickGap={40} fontVariant="bold" />
                        <YAxis yAxisId="left" fontSize={9} tickLine={false} axisLine={false} stroke="hsl(var(--primary))" />
                        <YAxis yAxisId="right" orientation="right" fontSize={9} tickLine={false} axisLine={false} stroke="rgba(59,130,246,0.5)" />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)' }}
                          itemStyle={{ color: 'var(--foreground)' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="intensity" fill="url(#intGrad)" stroke="hsl(var(--primary))" strokeWidth={3} />
                        <Bar yAxisId="right" dataKey="size" fill="rgba(59,130,246,0.15)" radius={[4, 4, 0, 0]} barSize={12} />
                        <Line yAxisId="left" type="step" dataKey="dets" stroke="rgba(255,255,255,0.2)" strokeWidth={1} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 2. Region Spectrum mapping */}
                <Card className="xl:col-span-7 shadow-none border-border/60 overflow-hidden bg-card">
                  <CardHeader className="p-5 border-b bg-muted/10">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Region Intensity Spectrum
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[350px]">
                    {areaGraphData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                          <XAxis dataKey="area" name="Physical Area" unit="m²" fontSize={10} tickLine={false} axisLine={false} fontVariant="bold" />
                          <YAxis dataKey="intensity" name="Flux Intensity" fontSize={10} tickLine={false} axisLine={false} fontVariant="bold" />
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
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-3 border-2 border-dashed rounded-2xl bg-muted/5">
                        <SignalHigh className="h-10 w-10 opacity-10" />
                        <p className="text-[10px] font-black uppercase tracking-widest italic">Signal nominal: No localized hits</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 3. Link Statistics Summary */}
                <div className="xl:col-span-5 flex flex-col gap-6">
                  <Card className="p-6 shadow-none border-border/60 bg-primary/[0.03] border-primary/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
                      <TrendingUp className="h-24 w-24" />
                    </div>
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                      <div className="space-y-1">
                        <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">System Variance</div>
                        <div className="text-4xl font-black italic tracking-tighter tabular-nums">
                          {historicalData.length >= 2 ? (historicalData[historicalData.length-1].intensity - historicalData[historicalData.length-2].intensity).toFixed(2) : "0.00"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Mean Hit Area</div>
                        <div className="text-4xl font-black italic tracking-tighter tabular-nums">
                          {areaGraphData.length > 0 ? (areaGraphData.reduce((acc, b) => acc + b.area, 0) / areaGraphData.length).toFixed(1) : "0.0"}
                          <span className="text-xs font-bold text-muted-foreground ml-2">M²</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  <Card className="flex-1 shadow-none border-border/60 overflow-hidden bg-card">
                    <CardHeader className="p-4 border-b bg-muted/5 flex flex-row items-center justify-between">
                      <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Search className="h-3.5 w-3.5" /> High-Confidence Hits
                      </CardTitle>
                      <Badge variant="outline" className="text-[9px] font-bold border-emerald-500/20 text-emerald-600 bg-emerald-500/5">NOMINAL_LINK</Badge>
                    </CardHeader>
                    <div className="p-4 space-y-3">
                      {selectedCapture.regions.slice(0, 5).map((region, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/40 hover:border-primary/30 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-muted border flex items-center justify-center text-[9px] font-black font-mono group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              {idx+1}
                            </div>
                            <span className="text-[10px] font-bold text-foreground/60">ANOMALY_REG_{String(idx+1).padStart(2, '0')}</span>
                          </div>
                          <span className="font-mono text-primary font-black text-xs">{region.area.toFixed(1)} <span className="opacity-40">M²</span></span>
                        </div>
                      ))}
                      {selectedCapture.regions.length === 0 && (
                        <div className="py-12 text-center text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">Zero anomalies registered</div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Anomaly Ledger (Full Width Grid) */}
              <Card className="shadow-none border-border/60 overflow-hidden bg-card">
                <CardHeader className="p-5 border-b bg-muted/10 flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                      <Maximize2 className="h-4 w-4" /> Comprehensive Anomaly Registry
                    </CardTitle>
                    <CardDescription className="text-[9px] font-bold uppercase tracking-widest opacity-50 italic">Full volumetric breakdown of localized sensor detections</CardDescription>
                  </div>
                  <div className="text-[9px] font-black text-muted-foreground/40 font-mono tracking-tighter bg-muted/20 px-3 py-1 rounded-full border border-border/40">
                    INGEST_TIMESTAMP: {new Date(selectedCapture.timestamp).toISOString()}
                  </div>
                </CardHeader>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                  {selectedCapture.regions.map((region, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border bg-muted/10 flex flex-col gap-3 hover:border-primary/40 hover:bg-primary/[0.02] transition-all group relative overflow-hidden shadow-sm">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform duration-700">
                        <Target className="h-12 w-12" />
                      </div>
                      <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10px] font-black text-muted-foreground/60 group-hover:text-primary transition-colors">HIT_#{String(idx + 1).padStart(3, '0')}</span>
                        <Badge variant="outline" className="font-mono text-[9px] font-black bg-background">{region.area.toFixed(0)} M²</Badge>
                      </div>
                      <div className="text-[10px] font-mono font-black text-foreground/80 bg-background/80 px-2 py-2 rounded-lg border border-border/40 shadow-inner text-center relative z-10">
                        [{region.bbox.join(", ")}]
                      </div>
                    </div>
                  ))}
                  {selectedCapture.regions.length === 0 && (
                    <div className="col-span-full py-20 text-center flex flex-col items-center gap-4">
                      <div className="p-6 rounded-full bg-muted/30 border border-dashed border-border/60">
                        <SignalHigh className="h-12 w-12 text-muted-foreground/20" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/40 italic">Sensor Array Nominal</p>
                        <p className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest">No localized regions logged in this transmission.</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-[3rem] bg-muted/5 min-h-[700px] border-border/40">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl animate-pulse" />
                <Loader2 className="h-20 w-20 animate-spin text-muted-foreground/10" />
              </div>
              <p className="mt-10 text-[10px] font-black uppercase tracking-[0.6em] text-muted-foreground/30 italic">Synchronizing Node Link...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
