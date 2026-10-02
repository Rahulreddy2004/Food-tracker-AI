import { ArrowRight, Camera, MessageCircleHeart, Package, ScanBarcode, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { ErrorState } from "@/components/layout";
import { MealSections } from "@/components/meals";
import { CalorieRing, MacroBars } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api/client";
import { useMeals, useProfile, useTimeZone, useToday } from "@/lib/api/queries";
import type { MealType } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { formatDay, greeting, guessMealType, localHour } from "@/lib/dates";
import { kcal, sum } from "@/lib/nutrition";
import { useTitle } from "@/lib/useTitle";

import { AddFoodSheet } from "../food/AddFoodSheet";
import { EditMealSheet } from "../diary/EditMealSheet";
import { useMealActions } from "../diary/useMealActions";

const PROMPTS = [
  "What should I have for dinner?",
  "Am I getting enough protein?",
  "A quick high-protein breakfast?",
];

export default function TodayPage() {
  useTitle("Today");
  const { user } = useAuth();
  const navigate = useNavigate();
  const timeZone = useTimeZone();
  const today = useToday();
  const profile = useProfile();
  const meals = useMeals(today, today);
  const actions = useMealActions();
  const [adding, setAdding] = useState<MealType | null>(null);

  const hour = localHour(new Date(), timeZone);
  const name = profile.data?.displayName ?? user?.displayName?.split(" ")[0];
  const totals = sum((meals.data ?? []).map((m) => m.totals));
  const targets = profile.data?.targets;

  return (
    <div className="container-app">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
        <div>
          <p className="text-sm font-medium text-ink-muted">{formatDay(today)}</p>
          <h1 className="mt-1 text-[2.1rem] leading-tight font-semibold sm:text-[2.6rem]">
            {greeting(hour)}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <Button asChild size="lg" className="hidden sm:inline-flex lg:hidden">
          <Link to="/app/scan">
            <Camera /> Scan a meal
          </Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="grid items-center gap-8 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
          {targets && meals.data ? (
            <>
              <CalorieRing
                eaten={totals.kcal}
                target={targets.kcal}
                className="justify-self-center"
              />
              <div className="grid gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-ink-muted">Eaten</p>
                    <p className="font-display text-3xl font-semibold tabular">
                      {kcal(totals.kcal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-ink-muted">Goal</p>
                    <p className="font-display text-3xl font-semibold tabular">
                      {kcal(targets.kcal)}
                    </p>
                  </div>
                </div>
                <MacroBars totals={totals} targets={targets} />
              </div>
            </>
          ) : meals.isError ? (
            <ErrorState message={errorMessage(meals.error)} onRetry={() => void meals.refetch()} />
          ) : (
            <>
              <Skeleton className="size-52 justify-self-center rounded-full" />
              <div className="grid gap-4">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-28" />
              </div>
            </>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Link
            to="/app/scan"
            className="group relative flex items-center gap-5 overflow-hidden rounded-lg bg-primary p-6 text-primary-fg shadow-lift transition-transform hover:-translate-y-0.5"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/15">
              <Camera className="size-7" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-2xl font-semibold">Scan a meal</span>
              <span className="block text-sm text-primary-fg/85">
                Photo → foods → calories, in seconds
              </span>
            </span>
            <ArrowRight className="ml-auto size-5 shrink-0 transition-transform group-hover:translate-x-1" />
            <span
              aria-hidden
              className="absolute -right-10 -bottom-12 size-36 rounded-full bg-white/10"
            />
          </Link>
          <div className="grid grid-cols-3 gap-3">
            {[
              { to: "/app/barcode", icon: ScanBarcode, label: "Barcode" },
              { onClick: () => setAdding(guessMealType(hour)), icon: Search, label: "Search" },
              { to: "/app/pantry", icon: Package, label: "Pantry" },
            ].map((a) => {
              const inner = (
                <>
                  <a.icon className="size-6 text-primary" />
                  <span className="text-sm font-medium">{a.label}</span>
                </>
              );
              const cls =
                "grid justify-items-center gap-2 rounded-lg border border-line bg-surface py-4 shadow-soft transition-colors hover:border-line-strong hover:bg-surface-2";
              return a.to ? (
                <Link key={a.label} to={a.to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                  {inner}
                </button>
              );
            })}
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-secondary-soft text-secondary">
                <MessageCircleHeart className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Ask Nutri, your coach</p>
                <p className="text-sm text-ink-muted">Answers use your goals and today's meals.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void navigate(`/app/coach?ask=${encodeURIComponent(p)}`)}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-secondary hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <section aria-labelledby="todays-meals" className="mt-12">
        <h2 id="todays-meals" className="sr-only">
          Today's meals
        </h2>
        {meals.data ? (
          <MealSections
            meals={meals.data}
            timeZone={timeZone}
            onAdd={(type) => setAdding(type)}
            onEdit={actions.onEdit}
            onDelete={actions.onDelete}
          />
        ) : (
          <div className="grid gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}
      </section>

      <AddFoodSheet
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        day={today}
        mealType={adding ?? "snack"}
      />
      <EditMealSheet meal={actions.editing} onClose={actions.closeEdit} />
    </div>
  );
}
