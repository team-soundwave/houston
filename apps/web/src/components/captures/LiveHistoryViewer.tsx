import { useEffect, useMemo, useRef, useState } from "react";

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

function luminance(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function histogramThreshold(histogram: Uint32Array, keepFraction: number) {
  let total = 0;
  for (const count of histogram) total += count;
  if (total === 0) return 255;
  const cutoff = Math.max(1, Math.round(total * (1 - keepFraction)));
  let seen = 0;
  for (let value = histogram.length - 1; value >= 0; value -= 1) {
    seen += histogram[value] ?? 0;
    if (seen >= cutoff) return value;
  }
  return 255;
}

function scaledDimensions(image: HTMLImageElement, maxWidth = 1280) {
  if (image.naturalWidth <= maxWidth) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  const scale = maxWidth / image.naturalWidth;
  return {
    width: Math.round(image.naturalWidth * scale),
    height: Math.round(image.naturalHeight * scale),
  };
}

export default function LiveHistoryViewer({ frames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all(frames.map(async (frame) => [frame.captureId, await loadImage(frame.url)] as const))
      .then((pairs) => {
        if (!cancelled) setLoaded(Object.fromEntries(pairs));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [frames]);

  const selectedFrames = useMemo(() => [...frames], [frames]);

  useEffect(() => {
    if (!canvasRef.current || selectedFrames.length < 2) return;
    const latestFrame = selectedFrames.at(-1);
    if (!latestFrame) return;
    const latestImage = loaded[latestFrame.captureId];
    if (!latestImage) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;

    const render = async () => {
      setBuilding(true);
      try {
        const { width, height } = scaledDimensions(latestImage);
        canvas.width = width;
        canvas.height = height;

        const scratch = document.createElement("canvas");
        scratch.width = width;
        scratch.height = height;
        const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
        if (!scratchCtx) return;
        const overlay = ctx.createImageData(width, height);
        const accumulated = new Float32Array(width * height);
        const accumulatedRed = new Float32Array(width * height);
        const accumulatedGreen = new Float32Array(width * height);
        const accumulatedBlue = new Float32Array(width * height);
        const pairCount = selectedFrames.length - 1;
        let strongestPixel = 0;

        for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
          const previous = loaded[selectedFrames[pairIndex].captureId];
          const current = loaded[selectedFrames[pairIndex + 1].captureId];
          if (!previous || !current) continue;

          scratchCtx.clearRect(0, 0, width, height);
          scratchCtx.drawImage(previous, 0, 0, width, height);
          const previousData = scratchCtx.getImageData(0, 0, width, height).data;
          scratchCtx.clearRect(0, 0, width, height);
          scratchCtx.drawImage(current, 0, 0, width, height);
          const currentData = scratchCtx.getImageData(0, 0, width, height).data;
          const pairDelta = new Float32Array(width * height);
          const histogram = new Uint32Array(256);

          for (let index = 0; index < currentData.length; index += 4) {
            const redDelta = Math.abs(currentData[index] - previousData[index]);
            const greenDelta = Math.abs(currentData[index + 1] - previousData[index + 1]);
            const blueDelta = Math.abs(currentData[index + 2] - previousData[index + 2]);
            const luminanceDelta = Math.abs(luminance(currentData, index) - luminance(previousData, index));
            const pixelIndex = index / 4;
            const delta = Math.max(
              luminanceDelta * 1.35,
              redDelta * 0.9,
              greenDelta * 0.9,
              blueDelta * 0.9,
              (redDelta + greenDelta + blueDelta) / 3,
            );
            pairDelta[pixelIndex] = delta;
            histogram[Math.min(255, Math.round(delta))] += 1;
          }

          const threshold = Math.max(18, histogramThreshold(histogram, 0.03));
          const pairProgress = pairCount <= 1 ? 1 : pairIndex / (pairCount - 1);
          const pairRed = 255 * (1 - pairProgress) + 64 * pairProgress;
          const pairGreen = 120 * (1 - pairProgress) + 220 * pairProgress;
          const pairBlue = 48 * (1 - pairProgress) + 255 * pairProgress;

          for (let pixelIndex = 0; pixelIndex < pairDelta.length; pixelIndex += 1) {
            const normalized = Math.max(0, pairDelta[pixelIndex] - threshold) / Math.max(1, 255 - threshold);
            if (normalized <= 0) continue;
            const boosted = Math.pow(normalized, 0.42) * 4.2;
            if (boosted < 0.18) continue;
            accumulated[pixelIndex] += boosted;
            accumulatedRed[pixelIndex] += boosted * pairRed;
            accumulatedGreen[pixelIndex] += boosted * pairGreen;
            accumulatedBlue[pixelIndex] += boosted * pairBlue;
            strongestPixel = Math.max(strongestPixel, accumulated[pixelIndex]);
          }

          if (pairIndex % 2 === 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
            if (cancelled) return;
          }
        }

        if (cancelled) return;
        ctx.fillStyle = "#020406";
        ctx.fillRect(0, 0, width, height);
        if (strongestPixel > 0) {
          for (let pixelIndex = 0; pixelIndex < accumulated.length; pixelIndex += 1) {
            const total = accumulated[pixelIndex];
            if (total <= 0) continue;
            const normalized = total / strongestPixel;
            if (normalized < 0.07) continue;
            const emphasized = Math.pow(normalized, 0.34);
            const outputIndex = pixelIndex * 4;
            const baseRed = accumulatedRed[pixelIndex] / total;
            const baseGreen = accumulatedGreen[pixelIndex] / total;
            const baseBlue = accumulatedBlue[pixelIndex] / total;
            overlay.data[outputIndex] = Math.min(255, Math.round(baseRed * emphasized));
            overlay.data[outputIndex + 1] = Math.min(255, Math.round(baseGreen * emphasized));
            overlay.data[outputIndex + 2] = Math.min(255, Math.round(baseBlue * emphasized));
            overlay.data[outputIndex + 3] = Math.min(255, Math.round(255 * Math.max(0.3, emphasized)));
          }
        }
        ctx.putImageData(overlay, 0, 0);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render live history");
        }
      } finally {
        if (!cancelled) setBuilding(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedFrames]);

  if (frames.length < 2) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Need at least two captures to build a range diff.</div>;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_1fr_auto] gap-4 items-end">
        <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
          <div className="font-semibold uppercase tracking-wide text-foreground">Live history window</div>
          <div className="mt-1">
            Earliest: {frameLabel(frames[0] ?? { captureId: "N/A", timestamp: "", url: "" })}
          </div>
          <div>
            Latest: {frameLabel(selectedFrames.at(-1) ?? { captureId: "N/A", timestamp: "", url: "" })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase text-muted-foreground">
            Summed diff map over {selectedFrames.length} captures / {Math.max(0, selectedFrames.length - 1)} diffs
          </div>
          <div className="h-3 rounded-full bg-gradient-to-r from-[#ff7a30] via-[#ffd452] to-[#56d8ff]" />
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted-foreground">
            <span>Earliest diffs</span>
            <span>Latest diffs</span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-[560px] rounded-xl border bg-muted/[0.03] overflow-hidden">
        {(!loaded[selectedFrames[0].captureId] || building) && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading range frames...</div>
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
