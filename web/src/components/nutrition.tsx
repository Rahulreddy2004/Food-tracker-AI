import { CircleAlert } from "lucide-react";

import { NumberTicker } from "@/components/NumberTicker";
import type { Macros, Targets } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { groupStyle } from "@/lib/foodGroups";
import { energySplit, kcal, MACROS } from "@/lib/nutrition";

interface CalorieRingProps {
  eaten: number;
  target: number;
  size?: number;
  className?: string;
  /** "goal" shows the daily target itself (onboarding), not what's left. */
  mode?: "remaining" | "goal";
}

/** Remaining-calories ring. Over target turns to the danger colour *with* an icon and label. */
export function CalorieRing({
  eaten,
  target,
  size = 208,
  className,
  mode = "remaining",
}: CalorieRingProps) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? eaten / target : 0;
  const over = eaten > target;
  const shown = Math.min(ratio, 1);
  const remaining = Math.abs(target - eaten);

  return (
    <div
      role="img"
      aria-label={
        over
          ? `${kcal(eaten)} of ${kcal(target)} kcal eaten, ${kcal(remaining)} over your goal`
          : `${kcal(eaten)} of ${kcal(target)} kcal eaten, ${kcal(remaining)} left`
      }
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? "var(--danger)" : "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          className="transition-[stroke-dashoffset] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
          {mode === "goal" ? "Daily goal" : over ? "Over goal" : "Left today"}
        </span>
        <span
          className={cn(
            "font-display text-[2.6rem] leading-none font-semibold tabular",
            over && "text-danger",
          )}
        >
          <NumberTicker value={mode === "goal" ? target : remaining} />
        </span>
        <span className="mt-1 inline-flex items-center justify-center gap-1 text-sm text-ink-muted">
          {over && <CircleAlert className="size-4 text-danger" />}
          {mode === "goal" ? "kcal per day" : `kcal · goal ${kcal(target)}`}
        </span>
      </div>
    </div>
  );
}

interface MacroBarsProps {
  totals: Macros;
  targets: Targets;
  className?: string;
}

/** Per-macro progress against targets. Text stays in ink colours; the coloured dot carries identity. */
export function MacroBars({ totals, targets, className }: MacroBarsProps) {
  return (
    <ul className={cn("grid gap-4", className)}>
      {MACROS.map((m) => {
        const value = totals[m.key];
        const goal = targets[m.key];
        const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
        return (
          <li key={m.key} className="grid gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <span aria-hidden className={cn("size-2.5 rounded-full", m.className)} />
                {m.label}
              </span>
              <span className="text-ink-muted tabular">
                <span className="font-semibold text-ink">{Math.round(value)}</span> /{" "}
                {Math.round(goal)} g
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-label={m.label}
              aria-valuenow={Math.round(value)}
              aria-valuemin={0}
              aria-valuemax={Math.round(goal)}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  m.className,
                )}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Thin stacked bar of where the energy comes from, with a 2px surface gap between segments. */
export function MacroSplit({ macros, className }: { macros: Macros; className?: string }) {
  const split = energySplit(macros);
  const parts = MACROS.filter((m) => split[m.key] > 0.005);
  const label = MACROS.map((m) => `${m.label} ${Math.round(split[m.key] * 100)}%`).join(", ");
  return (
    <div
      className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full", className)}
      role="img"
      aria-label={`Energy split: ${label}`}
    >
      {parts.length === 0 && <div className="h-full w-full rounded-full bg-surface-3" />}
      {parts.map((m) => (
        <div
          key={m.key}
          className={cn("h-full first:rounded-l-full last:rounded-r-full", m.className)}
          style={{ width: `${split[m.key] * 100}%` }}
        />
      ))}
    </div>
  );
}

export function MacroInline({ macros, className }: { macros: Macros; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted tabular",
        className,
      )}
    >
      {MACROS.map((m) => (
        <span key={m.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", m.className)} />
          <span className="sr-only">{m.label}</span>
          <span aria-hidden>{m.label[0]}</span> {Math.round(macros[m.key])} g
        </span>
      ))}
    </span>
  );
}

const TINTS = {
  primary: "var(--primary)",
  secondary: "var(--secondary)",
  accent: "var(--accent)",
  protein: "var(--protein)",
  fat: "var(--fat)",
} as const;

export function FoodIcon({ group, className }: { group?: string | null; className?: string }) {
  const { icon: Icon, tint } = groupStyle(group);
  const color = TINTS[tint];
  return (
    <span
      aria-hidden
      className={cn("grid size-11 shrink-0 place-items-center rounded-full", className)}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
    >
      <Icon className="size-[45%]" strokeWidth={1.8} />
    </span>
  );
}
