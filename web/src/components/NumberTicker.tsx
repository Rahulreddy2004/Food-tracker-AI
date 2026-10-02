import { animate } from "motion";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/useMediaQuery";

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Counts up to `value` (skipped when the user prefers reduced motion). */
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
    const controls = animate(from, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = fmt.format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {fmt.format(Math.round(value))}
    </span>
  );
}
