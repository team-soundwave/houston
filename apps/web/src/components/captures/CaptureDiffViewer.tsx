import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, FlipHorizontal2, Loader2, SplitSquareVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

type ViewMode = "current" | "previous" | "diff";

type Props = {
  currentUrl: string;
  previousUrl: string;
  currentLabel: string;
  previousLabel: string;
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

function drawDifference(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  current: HTMLImageElement,
  previous: HTMLImageElement,
) {
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const bufferCtx = buffer.getContext("2d");
  if (!bufferCtx) return;
  bufferCtx.drawImage(previous, 0, 0, width, height);
  const previousData = bufferCtx.getImageData(0, 0, width, height);
  bufferCtx.clearRect(0, 0, width, height);
  bufferCtx.drawImage(current, 0, 0, width, height);
  const currentData = bufferCtx.getImageData(0, 0, width, height);
  const output = bufferCtx.createImageData(width, height);

  for (let index = 0; index < currentData.data.length; index += 4) {
    const red = Math.abs(currentData.data[index] - previousData.data[index]);
    const green = Math.abs(currentData.data[index + 1] - previousData.data[index + 1]);
    const blue = Math.abs(currentData.data[index + 2] - previousData.data[index + 2]);
    const intensity = Math.min(255, Math.max(red, green, blue) * 4);
    output.data[index] = intensity;
    output.data[index + 1] = Math.min(255, intensity * 0.8);
    output.data[index + 2] = Math.min(255, intensity * 0.3);
    output.data[index + 3] = 255;
  }

  ctx.putImageData(output, 0, 0);
}

export default function CaptureDiffViewer({ currentUrl, previousUrl, currentLabel, previousLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ViewMode>("diff");
  const [flipEnabled, setFlipEnabled] = useState(false);
  const [frame, setFrame] = useState<"current" | "previous">("current");
  const [images, setImages] = useState<{ current: HTMLImageElement; previous: HTMLImageElement } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    setError(null);
    void Promise.all([loadImage(currentUrl), loadImage(previousUrl)])
      .then(([current, previous]) => {
        if (!cancelled) setImages({ current, previous });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUrl, previousUrl]);

  useEffect(() => {
    if (!flipEnabled) {
      setFrame("current");
      return;
    }
    const timer = window.setInterval(() => {
      setFrame((value) => (value === "current" ? "previous" : "current"));
    }, 700);
    return () => window.clearInterval(timer);
  }, [flipEnabled]);

  const activeMode = useMemo<ViewMode>(() => {
    if (flipEnabled) return frame;
    return mode;
  }, [flipEnabled, frame, mode]);

  useEffect(() => {
    if (!images || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const width = images.current.naturalWidth;
      const height = images.current.naturalHeight;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      if (activeMode === "diff") {
        drawDifference(ctx, width, height, images.current, images.previous);
        return;
      }
      ctx.drawImage(activeMode === "current" ? images.current : images.previous, 0, 0, width, height);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to render comparison");
    }
  }, [activeMode, images]);

  const statusLabel = activeMode === "current" ? currentLabel : activeMode === "previous" ? previousLabel : "Pixel difference";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={mode === "current" && !flipEnabled ? "secondary" : "outline"} size="sm" onClick={() => { setFlipEnabled(false); setMode("current"); }}>
            Current
          </Button>
          <Button variant={mode === "previous" && !flipEnabled ? "secondary" : "outline"} size="sm" onClick={() => { setFlipEnabled(false); setMode("previous"); }}>
            Previous
          </Button>
          <Button variant={mode === "diff" && !flipEnabled ? "secondary" : "outline"} size="sm" onClick={() => { setFlipEnabled(false); setMode("diff"); }}>
            <SplitSquareVertical className="h-3.5 w-3.5 mr-2" />
            Diff
          </Button>
          <Button variant={flipEnabled ? "secondary" : "outline"} size="sm" onClick={() => setFlipEnabled((value) => !value)}>
            <FlipHorizontal2 className="h-3.5 w-3.5 mr-2" />
            A/B Flip
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
          <Badge variant="outline" className="text-[9px]">{statusLabel}</Badge>
          <ArrowLeftRight className="h-3.5 w-3.5 opacity-40" />
          <span>{previousLabel}</span>
          <span className="opacity-30">vs</span>
          <span>{currentLabel}</span>
        </div>
      </div>

      <div className="relative flex-1 min-h-[520px] rounded-xl border bg-muted/[0.03] overflow-hidden">
        {!images && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Loading comparison frames...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {error}
          </div>
        )}
        <div className={cn("h-full w-full flex items-center justify-center p-4", (!images || error) && "opacity-0")}>
          <canvas ref={canvasRef} className="max-h-[680px] w-auto max-w-full rounded border shadow-lg object-contain" />
        </div>
      </div>
    </div>
  );
}
