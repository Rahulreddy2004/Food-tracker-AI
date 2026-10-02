import { useId } from "react";

import { Slider } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

interface PortionEditorProps {
  grams: number;
  onChange: (grams: number) => void;
  servingG: number;
  servingLabel?: string | null;
  className?: string;
}

const clamp = (n: number) => Math.min(Math.max(Math.round(n), 1), 3000);

/** Grams via slider, number field, or serving shortcuts (½, 1, 1½, 2). */
export function PortionEditor({
  grams,
  onChange,
  servingG,
  servingLabel,
  className,
}: PortionEditorProps) {
  const id = useId();
  const max = Math.max(Math.round(servingG * 3), grams, 50);
  const shortcuts = [0.5, 1, 1.5, 2];
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          Portion
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={3000}
            value={Math.round(grams)}
            onChange={(e) => onChange(clamp(Number(e.target.value) || 1))}
            className="h-9 w-20 rounded-md border border-line-strong bg-surface px-2 text-right font-medium tabular focus-visible:border-primary focus-visible:outline-none"
          />
          <span className="text-sm text-ink-muted">g</span>
        </div>
      </div>
      <Slider
        aria-label="Portion in grams"
        min={5}
        max={max}
        step={5}
        value={[Math.min(grams, max)]}
        onValueChange={(v) => onChange(clamp(v[0] ?? grams))}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Serving shortcuts">
        {shortcuts.map((s) => {
          const g = clamp(servingG * s);
          const active = Math.abs(grams - g) < 1;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(g)}
              aria-pressed={active}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors",
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              {s === 0.5 ? "½" : s === 1.5 ? "1½" : s}× {servingLabel ?? "serving"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
