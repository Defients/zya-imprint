import { lazy, Suspense } from "react";
import type { DateRangeKey } from "../utils";
import { SkeletonPanel } from "./SkeletonPanel";

const CosmoChart = lazy(() => import("./Charts").then((m) => ({ default: m.CosmoChart })));

interface LazyChartProps {
  data: ({ name: string } & Record<string, string | number>)[];
  lines: { key: string; color: string; name: string }[];
  chartType?: "line" | "area";
  dateRange?: DateRangeKey;
}

export function LazyChart(props: LazyChartProps) {
  return (
    <Suspense fallback={<SkeletonPanel height="100%" label="Loading chart…" />}>
      <CosmoChart {...props} />
    </Suspense>
  );
}
