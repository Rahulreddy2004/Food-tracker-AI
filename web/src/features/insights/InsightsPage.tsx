import { CalendarCheck, Flame, Target, TrendingUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, ErrorState, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api/client";
import { useDailySummary, useMeals, useProfile, useToday } from "@/lib/api/queries";
import type { DaySummary } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { addDays, dayToDate, formatDay } from "@/lib/dates";
import { energySplit, kcal, MACROS, sum } from "@/lib/nutrition";
import { useTitle } from "@/lib/useTitle";

type Range = "7" | "30" | "90";

const shortDate = (d: string) =>
  dayToDate(d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        {icon}
        {label}
      </p>
      <p className="mt-2 font-display text-[2rem] leading-none font-semibold tabular">{value}</p>
      {hint && <p className="mt-2 text-sm text-ink-muted">{hint}</p>}
    </Card>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  target: number;
}

function CaloriesTooltip({ active, payload, target }: TooltipProps) {
  const point = payload?.[0]?.payload as { date: string; kcal: number; meals: number } | undefined;
  if (!active || !point) return null;
  const diff = point.kcal - target;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-lift">
      <p className="font-medium">
        {formatDay(point.date, { weekday: "short", month: "short", day: "numeric" })}
      </p>
      {point.meals ? (
        <>
          <p className="tabular">
            <span className="font-semibold">{kcal(point.kcal)}</span> kcal
          </p>
          <p className="text-ink-muted tabular">
            {diff > 0 ? `${kcal(diff)} over goal` : `${kcal(-diff)} under goal`}
          </p>
        </>
      ) : (
        <p className="text-ink-muted">Nothing logged</p>
      )}
    </div>
  );
}

function CaloriesChart({ days, target }: { days: DaySummary[]; target: number }) {
  const data = days.map((d) => ({ date: d.date, kcal: Math.round(d.totals.kcal), meals: d.meals }));
  const max = Math.max(target * 1.25, ...data.map((d) => d.kcal));
  const tickEvery = days.length > 31 ? 14 : days.length > 8 ? 5 : 1;
  return (
    <figure>
      <div className="h-64 sm:h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 16, right: 8, bottom: 0, left: -12 }}
            barCategoryGap={days.length > 31 ? "18%" : "28%"}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              interval={tickEvery - 1}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              domain={[0, Math.ceil(max / 500) * 500]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              width={52}
              tickFormatter={(v: number) => kcal(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(props) => (
                <CaloriesTooltip active={props.active} payload={props.payload} target={target} />
              )}
            />
            <ReferenceLine
              y={target}
              stroke="var(--secondary)"
              strokeDasharray="5 4"
              strokeWidth={2}
              label={{
                value: `Goal ${kcal(target)}`,
                position: "insideTopRight",
                fill: "var(--ink-muted)",
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="kcal"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-left tabular">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">kcal</th>
              <th className="py-1 text-right font-medium">Meals</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-t border-line">
                <td className="py-1">
                  {formatDay(d.date, { weekday: "short", month: "short", day: "numeric" })}
                </td>
                <td className="py-1 text-right">{kcal(d.kcal)}</td>
                <td className="py-1 text-right">{d.meals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function MacroBalance({ days }: { days: DaySummary[] }) {
  const logged = days.filter((d) => d.meals > 0);
  const totals = sum(logged.map((d) => d.totals));
  const split = energySplit(totals);
  return (
    <div className="grid gap-4">
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={MACROS.map((m) => `${m.label} ${Math.round(split[m.key] * 100)}%`).join(", ")}
      >
        {MACROS.map((m) => (
          <div
            key={m.key}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", m.className)}
            style={{ width: `${split[m.key] * 100}%` }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {MACROS.map((m) => (
          <li key={m.key}>
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <span aria-hidden className={cn("size-2.5 rounded-full", m.className)} /> {m.label}
            </p>
            <p className="font-display text-2xl font-semibold tabular">
              {Math.round(split[m.key] * 100)}%
            </p>
            <p className="text-sm text-ink-muted tabular">
              {logged.length ? Math.round(totals[m.key] / logged.length) : 0} g/day
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-subtle">
        Share of calories from each macro, averaged over days you logged.
      </p>
    </div>
  );
}

function TopFoods({ from, to }: { from: string; to: string }) {
  const meals = useMeals(from, to);
  const top = useMemo(() => {
    const counts = new Map<string, { display: string; count: number; kcal: number }>();
    for (const meal of meals.data ?? []) {
      for (const item of meal.items) {
        const entry = counts.get(item.display) ?? { display: item.display, count: 0, kcal: 0 };
        entry.count += 1;
        entry.kcal += item.nutrition.kcal;
        counts.set(item.display, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, 6);
  }, [meals.data]);
  if (meals.isPending) return <Skeleton className="h-40" />;
  if (top.length === 0)
    return <p className="text-sm text-ink-muted">Nothing logged in this range yet.</p>;
  const most = top[0]?.count ?? 1;
  return (
    <ol className="grid gap-3">
      {top.map((f) => (
        <li key={f.display} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{f.display}</span>
            <span className="shrink-0 text-ink-muted tabular">
              {f.count}× · avg {kcal(f.kcal / f.count)} kcal
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(f.count / most) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ConsistencyCalendar({ today, target }: { today: string; target: number }) {
  const weeks = 12;
  const end = today;
  const lastMonday = addDays(end, -((dayToDate(end).getUTCDay() + 6) % 7));
  const start = addDays(lastMonday, -(weeks - 1) * 7);
  const summary = useDailySummary(start, end);
  const byDay = new Map((summary.data ?? []).map((d) => [d.date, d]));
  const level = (d?: DaySummary) => {
    if (!d || d.meals === 0) return 0;
    const r = d.totals.kcal / target;
    return r < 0.5 ? 1 : r < 0.85 ? 2 : r <= 1.1 ? 3 : 4;
  };
  const fills = [
    "var(--surface-3)",
    "var(--heat-1)",
    "var(--heat-2)",
    "var(--heat-3)",
    "var(--heat-4)",
  ];
  const labels = [
    "Nothing logged",
    "Under half your goal",
    "A bit under",
    "On target (±10%)",
    "Over goal",
  ];
  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)),
  );
  return (
    <div className="grid gap-3">
      <div className="flex gap-1 overflow-x-auto pb-1" role="grid" aria-label="Last 12 weeks">
        {columns.map((col) => (
          <div key={col[0]} className="grid gap-1" role="row">
            {col.map((d) => {
              const s = byDay.get(d);
              const l = level(s);
              const future = d > today;
              return (
                <div
                  key={d}
                  role="gridcell"
                  title={
                    future
                      ? undefined
                      : `${formatDay(d, { weekday: "short", month: "short", day: "numeric" })}: ${s?.meals ? `${kcal(s.totals.kcal)} kcal` : "nothing logged"}`
                  }
                  aria-label={future ? undefined : `${formatDay(d)}: ${labels[l]}`}
                  className={cn("size-4 rounded-[4px] sm:size-5", future && "opacity-0")}
                  style={{ backgroundColor: fills[l] }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {labels.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: fills[i] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  useTitle("Insights");
  const today = useToday();
  const [range, setRange] = useState<Range>("30");
  const from = addDays(today, -(Number(range) - 1));
  const summary = useDailySummary(from, today);
  const profile = useProfile();
  const target = profile.data?.targets.kcal ?? 2000;

  const days = summary.data ?? [];
  const logged = days.filter((d) => d.meals > 0);
  const avg = logged.length ? sum(logged.map((d) => d.totals)).kcal / logged.length : 0;
  const onTarget = logged.filter((d) => Math.abs(d.totals.kcal - target) <= target * 0.1).length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.meals ?? 0) > 0) streak++;
    else if (i === days.length - 1)
      continue; // today may not be logged yet
    else break;
  }

  return (
    <div className="container-app max-w-5xl">
      <PageHeader
        title="Insights"
        description="How your eating is trending. Calm numbers, no guilt."
        actions={
          <Segmented
            aria-label="Time range"
            value={range}
            onValueChange={setRange}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />
      {summary.isError ? (
        <ErrorState message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      ) : logged.length === 0 ? (
        <EmptyState
          title="No data in this range yet"
          action={
            <Button asChild>
              <Link to="/app/scan">Scan your first meal</Link>
            </Button>
          }
        >
          Log a few meals and your trends will appear here.
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              icon={<Flame className="size-4" />}
              label="Average per day"
              value={kcal(avg)}
              hint="kcal on days you logged"
            />
            <StatTile
              icon={<Target className="size-4" />}
              label="Days on target"
              value={`${onTarget}/${logged.length}`}
              hint="within 10% of your goal"
            />
            <StatTile
              icon={<CalendarCheck className="size-4" />}
              label="Days logged"
              value={`${logged.length}`}
              hint={`of the last ${range}`}
            />
            <StatTile
              icon={<TrendingUp className="size-4" />}
              label="Current streak"
              value={`${streak}`}
              hint={streak === 1 ? "day in a row" : "days in a row"}
            />
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Calories per day</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Dashed line: your goal of {kcal(target)} kcal.
            </p>
            <CaloriesChart days={days} target={target} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="mb-4 text-xl font-semibold">Macro balance</h2>
              <MacroBalance days={days} />
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="mb-4 text-xl font-semibold">Your most logged foods</h2>
              <TopFoods from={from} to={today} />
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Consistency</h2>
            <p className="mb-4 text-sm text-ink-muted">The last 12 weeks, one square per day.</p>
            <ConsistencyCalendar today={today} target={target} />
          </Card>
        </div>
      )}
    </div>
  );
}
