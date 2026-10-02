import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/useMediaQuery";

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts up to `value` (skipped when the user prefers reduced motion). No animation library. */
export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    if (reduced || from === value) {
      node.textContent = fmt.format(Math.round(value));
      return;
    }
    const started = performance.now();
    const duration = 900;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - started) / duration, 1);
      node.textContent = fmt.format(Math.round(from + (value - from) * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {fmt.format(Math.round(value))}
    </span>
  );
}
