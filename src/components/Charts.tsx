import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DateRangeKey } from "../utils";
import { filterByDateRange } from "../utils";

type ChartPoint = { name: string } & Record<string, string | number>;

interface ChartProps {
  data: ChartPoint[];
  lines: { key: string; color: string; name: string }[];
  chartType?: "line" | "area";
  dateRange?: DateRangeKey;
}

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><p>{label}</p>{payload.map((entry) => <strong key={entry.dataKey} style={{ color: entry.color }}>{entry.name}: {Number(entry.value || 0).toLocaleString()}</strong>)}</div>;
}

export function CosmoChart({ data, lines, chartType = "line", dateRange = "all" }: ChartProps) {
  const filtered = filterByDateRange(data, dateRange);
  if (!filtered.length) return <div className="flex h-full items-center justify-center text-sm text-slate-500">No data in selected range.</div>;

  const sharedElements = (
    <>
      <CartesianGrid strokeDasharray="4 5" stroke="rgba(255,255,255,.08)" vertical={false} />
      <XAxis dataKey="name" stroke="rgba(226,232,240,.55)" tick={{ fill: "rgba(226,232,240,.6)", fontSize: 11 }} tickMargin={10} minTickGap={28} />
      <YAxis stroke="rgba(226,232,240,.45)" tick={{ fill: "rgba(226,232,240,.55)", fontSize: 11 }} tickMargin={8} allowDecimals={false} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ color: "rgba(226,232,240,.75)", fontSize: 12 }} />
    </>
  );

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filtered} margin={{ top: 6, right: 16, left: -10, bottom: 4 }}>
          <defs>{lines.map((line) => (
            <linearGradient key={line.key} id={`grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0.02} />
            </linearGradient>
          ))}</defs>
          {sharedElements}
          {lines.map((line) => <Area key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} fill={`url(#grad-${line.key})`} dot={false} activeDot={{ r: 4 }} />)}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={filtered} margin={{ top: 6, right: 16, left: -10, bottom: 4 }}>
        {sharedElements}
        {lines.map((line) => <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
