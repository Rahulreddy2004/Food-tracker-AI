import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { ErrorState, PageHeader } from "@/components/layout";
import { MealCard, MealSections } from "@/components/meals";
import { MacroInline, MacroSplit } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api/client";
import { useDailySummary, useMeals, useProfile, useTimeZone, useToday } from "@/lib/api/queries";
import type { MealType } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { addDays, dayToDate, daysBetween, formatDay, relativeDayLabel } from "@/lib/dates";
import { kcal, sum } from "@/lib/nutrition";
import { useTitle } from "@/lib/useTitle";

import { AddFoodSheet } from "../food/AddFoodSheet";
import { EditMealSheet } from "./EditMealSheet";
import { useMealActions } from "./useMealActions";

/** Monday of the week containing `day`. */
function weekStart(day: string): string {
  const weekday = (dayToDate(day).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

function WeekStrip({
  day,
  today,
  onSelect,
}: {
  day: string;
  today: string;
  onSelect: (d: string) => void;
}) {
  const start = weekStart(day);
  const end = addDays(start, 6);
  const summary = useDailySummary(start, end);
  const profile = useProfile();
  const target = profile.data?.targets.kcal ?? 2000;
  const byDay = new Map((summary.data ?? []).map((d) => [d.date, d]));
  return (
    <div
      className="grid grid-cols-7 gap-1.5 sm:gap-2"
      role="group"
      aria-label="Choose a day this week"
    >
      {daysBetween(start, end).map((d) => {
        const s = byDay.get(d);
        const pct = s ? Math.min(s.totals.kcal / target, 1) : 0;
        const over = s ? s.totals.kcal > target : false;
        const selected = d === day;
        const future = d > today;
        return (
          <button
            key={d}
            type="button"
            disabled={future}
            onClick={() => onSelect(d)}
            aria-pressed={selected}
            aria-label={`${formatDay(d)}${s?.meals ? `, ${kcal(s.totals.kcal)} kcal` : ", nothing logged"}`}
            className={cn(
              "grid justify-items-center gap-1.5 rounded-lg border py-2.5 transition-colors disabled:opacity-40",
              selected
                ? "border-primary bg-surface shadow-soft"
                : "border-transparent hover:bg-surface-2",
            )}
          >
            <span className="text-xs font-medium text-ink-muted">
              {dayToDate(d).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })}
            </span>
            <span
              className={cn(
                "font-display text-lg leading-none font-semibold tabular",
                d === today && "text-primary",
              )}
            >
              {Number(d.slice(8))}
            </span>
            <span aria-hidden className="h-1.5 w-7 overflow-hidden rounded-full bg-surface-3">
              <span
                className={cn("block h-full rounded-full", over ? "bg-danger" : "bg-primary")}
                style={{ width: `${pct * 100}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchResults({
  query,
  today,
  timeZone,
}: {
  query: string;
  today: string;
  timeZone: string;
}) {
  const from = addDays(today, -89);
  const meals = useMeals(from, today);
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () =>
      (meals.data ?? [])
        .filter((m) => m.items.some((i) => i.display.toLowerCase().includes(q)))
        .sort((a, b) => b.eatenAt.localeCompare(a.eatenAt)),
    [meals.data, q],
  );
  if (meals.isPending) return <Skeleton className="h-24" />;
  if (hits.length === 0) {
    return (
      <p className="py-10 text-center text-ink-muted">
        No meals with “{query}” in the last 90 days.
      </p>
    );
  }
  return (
    <div className="grid gap-3" aria-live="polite">
      <p className="text-sm text-ink-muted">
        {hits.length} {hits.length === 1 ? "meal" : "meals"} in the last 90 days
      </p>
      {hits.map((meal) => (
        <div key={meal.id}>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">
            {relativeDayLabel(meal.localDate, today)}
          </p>
          <MealCard meal={meal} timeZone={timeZone} />
        </div>
      ))}
    </div>
  );
}

export default function DiaryPage() {
  useTitle("Diary");
  const today = useToday();
  const timeZone = useTimeZone();
  const [params, setParams] = useSearchParams();
  const requested = params.get("day");
  const day =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const setDay = (d: string) => setParams(d === today ? {} : { day: d }, { replace: true });
  const meals = useMeals(day, day);
  const profile = useProfile();
  const actions = useMealActions();
  const [adding, setAdding] = useState<MealType | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const totals = sum((meals.data ?? []).map((m) => m.totals));
  const target = profile.data?.targets.kcal ?? 2000;

  return (
    <div className="container-app max-w-4xl">
      <PageHeader
        title="Diary"
        description="Everything you've logged, day by day."
        actions={
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              aria-label="Search your meals"
              placeholder="Search your meals"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-9 pl-10"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-surface-2"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        }
      />

      {deferredQuery.trim().length >= 2 ? (
        <SearchResults query={deferredQuery} today={today} timeZone={timeZone} />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous day"
              onClick={() => setDay(addDays(day, -1))}
            >
              <ChevronLeft />
            </Button>
            <div className="text-center">
              <h2 className="text-2xl font-semibold">{relativeDayLabel(day, today)}</h2>
              <p className="text-sm text-ink-muted">{formatDay(day)}</p>
            </div>
            <div className="flex items-center gap-1">
              {day !== today && (
                <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
                  Today
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next day"
                disabled={day >= today}
                onClick={() => setDay(addDays(day, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <WeekStrip day={day} today={today} onSelect={setDay} />

          <Card className="mt-6 grid gap-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="font-display text-3xl font-semibold tabular">
                  {kcal(totals.kcal)}
                </span>
                <span className="text-ink-muted"> / {kcal(target)} kcal</span>
              </p>
              <MacroInline macros={totals} />
            </div>
            <MacroSplit macros={totals} />
          </Card>

          <section className="mt-8" aria-label={`Meals on ${formatDay(day)}`}>
            {meals.isError ? (
              <ErrorState
                message={errorMessage(meals.error)}
                onRetry={() => void meals.refetch()}
              />
            ) : meals.data ? (
              <MealSections
                meals={meals.data}
                timeZone={timeZone}
                onAdd={setAdding}
                onEdit={actions.onEdit}
                onDelete={actions.onDelete}
              />
            ) : (
              <div className="grid gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            )}
          </section>
        </>
      )}

      <AddFoodSheet
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        day={day}
        mealType={adding ?? "snack"}
      />
      <EditMealSheet meal={actions.editing} onClose={actions.closeEdit} />
    </div>
  );
}
