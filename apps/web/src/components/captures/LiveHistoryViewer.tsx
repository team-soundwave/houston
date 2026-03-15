import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Rewind, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

type HistoryFrame = {
  captureId: string;
  timestamp: string;
  url: string;
};

type Props = {
  frames: HistoryFrame[];
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${url}`));
    image.src = url;
  });
}

function frameLabel(frame: HistoryFrame): string {
  return `${frame.captureId.slice(-8).toUpperCase()} · ${new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function diffCanvas(previous: HTMLImageElement, current: HTMLImageElement): HTMLCanvasElement {
  const width = current.naturalWidth;
  const height = current.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) return canvas;

  scratchCtx.drawImage(previous, 0, 0, width, height);
  const previousData = scratchCtx.getImageData(0, 0, width, height);
  scratchCtx.clearRect(0, 0, width, height);
  scratchCtx.drawImage(current, 0, 0, width, height);
  const currentData = scratchCtx.getImageData(0, 0, width, height);
  const output = scratchCtx.createImageData(width, height);

  for (let index = 0; index < currentData.data.length; index += 4) {
    const prevLum = previousData.data[index] * 0.2126 + previousData.data[index + 1] * 0.7152 + previousData.data[index + 2] * 0.0722;
    const currLum = currentData.data[index] * 0.2126 + currentData.data[index + 1] * 0.7152 + currentData.data[index + 2] * 0.0722;
    const delta = Math.max(0, Math.abs(currLum - prevLum) - 10);
    const normalized = delta / 245;
    const logResponse = Math.log1p(normalized * 24) / Math.log1p(24);
    const emphasized = Math.pow(logResponse, 1.8);
    const intensity = Math.min(255, Math.round(emphasized * 255));
    output.data[index] = intensity;
    output.data[index + 1] = Math.min(255, Math.round(intensity * 0.78));
    output.data[index + 2] = Math.min(255, Math.round(intensity * 0.18));
    output.data[index + 3] = intensity;
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
}

export default function LiveHistoryViewer({ frames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseCaptureId, setBaseCaptureId] = useState<string>(frames[0]?.captureId ?? "");
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const diffCache = useRef<Record<string, HTMLCanvasElement>>({});
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!frames.find((frame) => frame.captureId === baseCaptureId)) {
      setBaseCaptureId(frames[0]?.captureId ?? "");
    }
  }, [baseCaptureId, frames]);

  useEffect(() => {
    setProgress(0);
  }, [baseCaptureId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(frames.map(async (frame) => [frame.captureId, await loadImage(frame.url)] as const))
      .then((pairs) => {
        if (cancelled) return;
        setLoaded(Object.fromEntries(pairs));
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [frames]);

  const activeFrames = useMemo(() => {
    const baseIndex = Math.max(0, frames.findIndex((frame) => frame.captureId === baseCaptureId));
    return frames.slice(baseIndex);
  }, [baseCaptureId, frames]);

  const maxProgress = Math.max(0, activeFrames.length - 1);

  useEffect(() => {
    if (!playing || maxProgress <= 0) return;
    const tick = (now: number) => {
      if (lastTickRef.current === null) lastTickRef.current = now;
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setProgress((value) => {
        const next = value + delta * 0.55;
        if (next >= maxProgress) {
          setPlaying(false);
          return maxProgress;
        }
        return next;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      lastTickRef.current = null;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [maxProgress, playing]);

  useEffect(() => {
    if (!canvasRef.current || activeFrames.length < 2) return;
    const previousIndex = Math.min(Math.floor(progress), activeFrames.length - 2);
    const currentIndex = Math.min(previousIndex + 1, activeFrames.length - 1);
    const previousFrame = activeFrames[previousIndex];
    const currentFrame = activeFrames[currentIndex];
    const previousImage = loaded[previousFrame.captureId];
    const currentImage = loaded[currentFrame.captureId];
    if (!previousImage || !currentImage) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const phase = progress - previousIndex;
      const width = currentImage.naturalWidth;
      const height = currentImage.naturalHeight;
      canvas.width = width;
      canvas.height = height;

      const diffKey = `${previousFrame.captureId}:${currentFrame.captureId}`;
      if (!diffCache.current[diffKey]) {
        diffCache.current[diffKey] = diffCanvas(previousImage, currentImage);
      }
      const diff = diffCache.current[diffKey];

      ctx.clearRect(0, 0, width, height);
      if (phase < 0.22) {
        ctx.drawImage(previousImage, 0, 0, width, height);
      } else if (phase < 0.52) {
        ctx.drawImage(previousImage, 0, 0, width, height);
        ctx.globalAlpha = (phase - 0.22) / 0.3;
        ctx.drawImage(diff, 0, 0, width, height);
        ctx.globalAlpha = 1;
      } else if (phase < 0.82) {
        const blend = (phase - 0.52) / 0.3;
        ctx.globalAlpha = 1 - blend;
        ctx.drawImage(previousImage, 0, 0, width, height);
        ctx.globalAlpha = blend;
        ctx.drawImage(currentImage, 0, 0, width, height);
        ctx.globalAlpha = 0.55 * (1 - blend);
        ctx.drawImage(diff, 0, 0, width, height);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(currentImage, 0, 0, width, height);
        ctx.globalAlpha = Math.max(0, (1 - phase) / 0.18) * 0.28;
        ctx.drawImage(diff, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to render live history");
    }
  }, [activeFrames, loaded, progress]);

  if (frames.length < 2) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Need at least two captures to animate history.</div>;
  }

  const stepIndex = Math.min(Math.floor(progress), Math.max(0, activeFrames.length - 2));
  const previousFrame = activeFrames[stepIndex];
  const currentFrame = activeFrames[Math.min(stepIndex + 1, activeFrames.length - 1)];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_auto] gap-4 items-center">
        <label className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
          Series start
          <select
            value={baseCaptureId}
            onChange={(event) => setBaseCaptureId(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          >
            {frames.map((frame) => (
              <option key={frame.captureId} value={frame.captureId}>
                {frameLabel(frame)}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={maxProgress}
            step={0.01}
            value={progress}
            onChange={(event) => {
              setPlaying(false);
              setProgress(Number(event.target.value));
            }}
            className="w-full accent-primary"
          />
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted-foreground">
            <span>{frameLabel(previousFrame)}</span>
            <span>{frameLabel(currentFrame)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={playing ? "secondary" : "outline"} size="sm" onClick={() => setPlaying((value) => !value)}>
            {playing ? <Pause className="h-3.5 w-3.5 mr-2" /> : <Play className="h-3.5 w-3.5 mr-2" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setPlaying(false); setProgress(0); }}>
            <Rewind className="h-3.5 w-3.5 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
        <Badge variant="secondary" className="text-[9px]">
          <Sparkles className="h-3 w-3 mr-1" />
          Diff-emphasized playback
        </Badge>
        <span>Sequence length {activeFrames.length}</span>
      </div>

      <div className="relative flex-1 min-h-[560px] rounded-xl border bg-muted/[0.03] overflow-hidden">
        {!loaded[previousFrame.captureId] && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading history frames...</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">{error}</div>
        )}
        <div className="h-full w-full flex items-center justify-center p-4">
          <canvas ref={canvasRef} className="max-h-[700px] w-auto max-w-full rounded border shadow-lg object-contain" />
        </div>
      </div>
    </div>
  );
}
