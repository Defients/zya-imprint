interface SkeletonPanelProps {
  height?: string;
  label?: string;
}

export function SkeletonPanel({ height = "300px", label }: SkeletonPanelProps) {
  return (
    <div
      className="glass-panel animate-pulse-skeleton rounded-[28px] p-5"
      style={{ minHeight: height }}
      aria-label={label || "Loading…"}
      role="status"
    >
      <div className="flex flex-col gap-4">
        <div className="h-4 w-32 rounded-full bg-white/8" />
        <div className="h-8 w-48 rounded-full bg-white/6" />
        <div className="mt-4 h-[200px] rounded-2xl bg-white/4" />
      </div>
    </div>
  );
}
