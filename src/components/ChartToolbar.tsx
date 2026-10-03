import { useState } from "react";
import { AreaChart as AreaIcon, LineChart as LineIcon } from "lucide-react";
import type { DateRangeKey } from "../utils";

const RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All" },
];

export function DateRangeSelector({ value, onChange }: { value: DateRangeKey; onChange: (key: DateRangeKey) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Date range">
      {RANGE_OPTIONS.map((opt) => (
        <button key={opt.key} className={`range-pill rounded-lg px-2.5 py-1 text-xs font-bold ${value === opt.key ? "is-active" : ""}`} onClick={() => onChange(opt.key)} aria-pressed={value === opt.key}>{opt.label}</button>
      ))}
    </div>
  );
}

export function ChartToolbar({ dateRange, onDateRangeChange, chartType, onChartTypeChange }: {
  dateRange: DateRangeKey;
  onDateRangeChange: (key: DateRangeKey) => void;
  chartType: "line" | "area";
  onChartTypeChange: (type: "line" | "area") => void;
}) {
  return (
    <div className="chart-toolbar flex items-center gap-3">
      <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
      <div className="flex gap-1" role="group" aria-label="Chart type">
        <button className={`range-pill rounded-lg p-1.5 ${chartType === "line" ? "is-active" : ""}`} onClick={() => onChartTypeChange("line")} aria-pressed={chartType === "line"} aria-label="Line chart"><LineIcon size={14} /></button>
        <button className={`range-pill rounded-lg p-1.5 ${chartType === "area" ? "is-active" : ""}`} onClick={() => onChartTypeChange("area")} aria-pressed={chartType === "area"} aria-label="Area chart"><AreaIcon size={14} /></button>
      </div>
    </div>
  );
}

export function useChartToolbarState() {
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [chartType, setChartType] = useState<"line" | "area">("line");
  return { dateRange, setDateRange, chartType, setChartType };
}
