import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number | string;
  className?: string;
  formatFn?: (n: number) => string;
  duration?: number;
}

export function AnimatedCounter({
  value,
  className,
  formatFn = (n) => n.toLocaleString(),
  duration = 600,
}: AnimatedCounterProps) {
  const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  const isNumeric = typeof value === "number" || (!Number.isNaN(numericValue) && String(value).match(/^-?[\d,]+$/));

  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value);
  const previousRef = useRef(0);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(value);
      return;
    }

    const target = numericValue;
    const start = previousRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setDisplayValue(Math.round(current));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        previousRef.current = target;
        setDisplayValue(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [numericValue, isNumeric, value, duration]);

  if (!isNumeric) return <strong className={className}>{String(value)}</strong>;
  return <strong className={className}>{formatFn(Number(displayValue))}</strong>;
}
