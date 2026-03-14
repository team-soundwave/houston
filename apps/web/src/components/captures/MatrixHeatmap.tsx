import { useEffect, useRef, useState } from "react";
import { Badge } from "../ui/badge";

type MatrixHeatmapProps = {
  matrix?: number[][];
};

/**
 * Standard Blue-Red (Cool-to-Warm) color ramp.
 * Blue (Low) -> White/Gray (Mid) -> Red (High)
 */
function interpolateColor(value: number): string {
  const colors = [
    { r: 37, g: 99, b: 235, stop: 0.0 },   // blue-600
    { r: 241, g: 245, b: 249, stop: 0.5 }, // slate-100
    { r: 220, g: 38, b: 38, stop: 1.0 },   // red-600
  ];

  if (value <= 0) return `rgb(${colors[0].r}, ${colors[0].g}, ${colors[0].b})`;
  if (value >= 1) return `rgb(${colors[colors.length - 1].r}, ${colors[colors.length - 1].g}, ${colors[colors.length - 1].b})`;

  for (let i = 0; i < colors.length - 1; i++) {
    const c1 = colors[i];
    const c2 = colors[i + 1];
    if (value >= c1.stop && value <= c2.stop) {
      const t = (value - c1.stop) / (c2.stop - c1.stop);
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return `rgb(${colors[0].r}, ${colors[0].g}, ${colors[0].b})`;
}

export default function MatrixHeatmap({ matrix }: MatrixHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number, y: number, val: number } | null>(null);

  useEffect(() => {
    if (!matrix || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rows = matrix.length;
    const cols = matrix[0].length;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set actual canvas size (high DPI)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Calculate cell size to maintain SQUARE aspect ratio
    // We want to fit 'cols' and 'rows' into 'rect.width' and 'rect.height'
    const cellSize = Math.min(rect.width / cols, rect.height / rows);
    
    // Calculate offsets to center the heatmap in the canvas
    const offsetX = (rect.width - (cols * cellSize)) / 2;
    const offsetY = (rect.height - (rows * cellSize)) / 2;

    const flat = matrix.flat();
    const maxVal = Math.max(...flat, 1e-6);

    ctx.clearRect(0, 0, rect.width, rect.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = matrix[r][c];
        ctx.fillStyle = interpolateColor(val / maxVal);
        // Draw slightly smaller to create a tiny gap/grid effect
        ctx.fillRect(
          offsetX + (c * cellSize), 
          offsetY + (r * cellSize), 
          cellSize - 0.5, 
          cellSize - 0.5
        );
      }
    }

    // Optional: Draw a subtle border around the active grid area
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, cols * cellSize, rows * cellSize);

  }, [matrix]);

  if (!matrix || matrix.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-muted/50 p-12 text-center">
        <p className="text-sm font-medium text-muted-foreground">Matrix data unavailable</p>
      </div>
    );
  }

  const rows = matrix.length;
  const cols = matrix[0].length;

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const cellSize = Math.min(rect.width / cols, rect.height / rows);
    const offsetX = (rect.width - (cols * cellSize)) / 2;
    const offsetY = (rect.height - (rows * cellSize)) / 2;

    const col = Math.floor((x - offsetX) / cellSize);
    const row = Math.floor((y - offsetY) / cellSize);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      setHoveredCell({ x: col, y: row, val: matrix[row][col] });
    } else {
      setHoveredCell(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-1 relative min-h-0 rounded-lg border bg-card/50 overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredCell(null)}
          className="h-full w-full cursor-crosshair"
        />
        
        {hoveredCell && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Badge variant="secondary" className="font-sans text-[10px] shadow-md border-primary/20 bg-background/90 backdrop-blur-sm">
              <span className="opacity-50 mr-1">Intensity:</span> {hoveredCell.val.toFixed(4)}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-600 shadow-[0_0_4px_rgba(37,99,235,0.4)]" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Muted</span>
        </div>
        <div className="h-1 flex-1 mx-6 rounded-full bg-gradient-to-r from-blue-600 via-slate-100 to-red-600 opacity-80" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Anomalous</span>
          <div className="h-2 w-2 rounded-full bg-red-600 shadow-[0_0_4px_rgba(220,38,38,0.4)]" />
        </div>
      </div>
    </div>
  );
}
