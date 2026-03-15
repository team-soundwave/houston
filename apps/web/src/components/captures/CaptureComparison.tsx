import { ArrowRight, Diff, Ghost, MoveRight, Radar } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { CaptureRecord, Region } from "../../types";

type Props = {
  capture: CaptureRecord;
  previousCapture: CaptureRecord | null;
};

type RegionMatch = {
  current: Region;
  previous: Region;
  distance: number;
  areaDelta: number;
};

function centerOf(region: Region): [number, number] {
  const [x, y, w, h] = region.bbox;
  return [x + w / 2, y + h / 2];
}

function compareRegions(current: Region[], previous: Region[]) {
  const matches: RegionMatch[] = [];
  const previousUsed = new Set<number>();
  const currentUsed = new Set<number>();

  current.forEach((region, currentIndex) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const [cx, cy] = centerOf(region);
    previous.forEach((candidate, previousIndex) => {
      if (previousUsed.has(previousIndex)) return;
      const [px, py] = centerOf(candidate);
      const distance = Math.hypot(cx - px, cy - py);
      const maxBoxSize = Math.max(region.bbox[2], region.bbox[3], candidate.bbox[2], candidate.bbox[3], 40);
      if (distance > maxBoxSize * 1.5 || distance >= bestDistance) return;
      bestIndex = previousIndex;
      bestDistance = distance;
    });
    if (bestIndex >= 0) {
      currentUsed.add(currentIndex);
      previousUsed.add(bestIndex);
      const previousRegion = previous[bestIndex];
      matches.push({
        current: region,
        previous: previousRegion,
        distance: bestDistance,
        areaDelta: region.area - previousRegion.area,
      });
    }
  });

  return {
    matches,
    added: current.filter((_, index) => !currentUsed.has(index)),
    removed: previous.filter((_, index) => !previousUsed.has(index)),
  };
}

function matrixDelta(current?: number[][], previous?: number[][]) {
  if (!current?.length || !previous?.length || current.length !== previous.length || current[0].length !== previous[0].length) {
    return null;
  }
  let total = 0;
  let peak = 0;
  let count = 0;
  for (let row = 0; row < current.length; row += 1) {
    for (let col = 0; col < current[row].length; col += 1) {
      const delta = Math.abs(current[row][col] - previous[row][col]);
      total += delta;
      peak = Math.max(peak, delta);
      count += 1;
    }
  }
  return { mean: total / count, peak };
}

export default function CaptureComparison({ capture, previousCapture }: Props) {
  if (!previousCapture) {
    return (
      <Card className="shadow-none border-border/60 bg-card">
        <CardHeader className="p-5 border-b bg-muted/10">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Change Since Previous Capture</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-sm text-muted-foreground">No earlier capture is available to compare against yet.</CardContent>
      </Card>
    );
  }

  const compared = compareRegions(capture.regions, previousCapture.regions);
  const changed = compared.matches.filter((match) => match.distance > 6 || Math.abs(match.areaDelta) > 10);
  const delta = matrixDelta(capture.matrix_data, previousCapture.matrix_data);

  return (
    <Card className="shadow-none border-border/60 bg-card overflow-hidden">
      <CardHeader className="p-5 border-b bg-muted/10 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Radar className="h-3.5 w-3.5" /> Change Since Previous Capture
        </CardTitle>
        <div className="text-[10px] font-mono text-muted-foreground opacity-60">
          {previousCapture.capture_id.slice(-8).toUpperCase()} <ArrowRight className="inline h-3 w-3 mx-1" /> {capture.capture_id.slice(-8).toUpperCase()}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="New Regions" value={compared.added.length} tone="emerald" icon={Diff} />
          <SummaryCard label="Moved Regions" value={changed.length} tone="amber" icon={MoveRight} />
          <SummaryCard label="Gone Regions" value={compared.removed.length} tone="slate" icon={Ghost} />
          <SummaryCard label="Mean Matrix Delta" value={delta ? delta.mean.toFixed(3) : "n/a"} tone="sky" icon={Radar} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <ChangeList title="New Since Last Frame" empty="No new dust regions were added." regions={compared.added} badge="New" />
          <MovedList matches={changed} />
          <ChangeList title="Disappeared Since Last Frame" empty="No prior regions disappeared." regions={compared.removed} badge="Gone" />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone: "emerald" | "amber" | "slate" | "sky"; icon: typeof Radar }) {
  const toneClass = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    slate: "text-slate-500",
    sky: "text-sky-500",
  }[tone];
  return (
    <div className="rounded-xl border bg-muted/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ChangeList({ title, empty, regions, badge }: { title: string; empty: string; regions: Region[]; badge: string }) {
  return (
    <div className="rounded-xl border bg-muted/5 p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      {regions.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">{empty}</div>
      ) : (
        regions.slice(0, 6).map((region, index) => (
          <div key={`${badge}-${index}`} className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[9px]">{badge}</Badge>
              <span className="text-[10px] font-mono">{region.area.toFixed(0)} px</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">[{region.bbox.join(", ")}]</div>
          </div>
        ))
      )}
    </div>
  );
}

function MovedList({ matches }: { matches: RegionMatch[] }) {
  return (
    <div className="rounded-xl border bg-muted/5 p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shifted Since Last Frame</div>
      {matches.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No tracked regions shifted enough to flag movement.</div>
      ) : (
        matches.slice(0, 6).map((match, index) => (
          <div key={`moved-${index}`} className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[9px]">Moved</Badge>
              <span className="text-[10px] font-mono">{match.distance.toFixed(1)} px</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Prev [{match.previous.bbox.join(", ")}]</div>
            <div className="text-[10px] text-muted-foreground">Now [{match.current.bbox.join(", ")}]</div>
          </div>
        ))
      )}
    </div>
  );
}
