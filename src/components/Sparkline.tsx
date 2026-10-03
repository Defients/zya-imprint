import { useId } from "react";
import { sparklinePath } from "../utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

export function Sparkline({ values, width = 60, height = 20, color = "#ff69b4", fillOpacity = 0.15, strokeWidth = 1.5 }: SparklineProps) {
  const gradientId = useId();
  const { line, area } = sparklinePath(values, width, height);

  if (!line) return <svg width={width} height={height} className="sparkline-cell" aria-hidden />;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline-cell" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
