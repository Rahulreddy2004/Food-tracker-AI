import {
  ArrowRight,
  Camera,
  CircleCheck,
  ImagePlus,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout";
import { MacroInline } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/misc";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useCreateMeal, useMealInsight, useScan, useTimeZone, useToday } from "@/lib/api/queries";
import type { MealType, NormBox } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { guessMealType, localHour, MEAL_TYPES } from "@/lib/dates";
import { prepareForScan } from "@/lib/image";
import { kcal, sum } from "@/lib/nutrition";
import { uploadMealPhoto } from "@/lib/photos";
import { useReducedMotion } from "@/lib/useMediaQuery";
import { useTitle } from "@/lib/useTitle";

import { AddFoodSheet } from "../food/AddFoodSheet";
import { CameraCapture } from "./CameraCapture";
import { PhotoDrop } from "./PhotoDrop";
import { ReviewItemCard } from "./ReviewItemCard";
import { itemNutrition, resolveItem, type ReviewItem, useScanFlow } from "./useScanFlow";

function failureText(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "models_unavailable":
        return {
          title: "Food recognition is waking up",
          detail: "Give it a minute and try again.",
        };
      case "unsupported_image":
        return {
          title: "We couldn't read that image",
          detail: error.detail ?? "Try a JPEG or PNG photo.",
        };
      case "image_too_large":
        return { title: "That photo is too large", detail: error.detail ?? "Try a smaller one." };
      case "rate_limited":
        return {
          title: "That's a lot of scans",
          detail: error.detail ?? "Wait a moment and try again.",
        };
      default:
        return { title: error.message, detail: error.detail ?? "Please try again." };
    }
  }
  return { title: "Something went wrong", detail: errorMessage(error) };
}

function PhotoWithBoxes({
  src,
  items,
  active,
  onActive,
  analyzing,
}: {
  src: string;
  items: ReviewItem[];
  active: string | null;
  onActive: (key: string | null) => void;
  analyzing?: boolean;
}) {
  const reduced = useReducedMotion();
  const boxed = items.filter((it): it is ReviewItem & { box: NormBox } => it.box !== null);
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface-3 shadow-lift">
      <img src={src} alt="Your meal photo" className="block max-h-[70dvh] w-full object-contain" />
      {analyzing && (
        <div aria-hidden className="absolute inset-0 bg-[rgb(28_23_20/0.25)]">
          <div className="absolute inset-x-0 h-24 animate-[scan_1.6s_ease-in-out_infinite_alternate] bg-gradient-to-b from-transparent via-[#fbf7f0]/45 to-transparent" />
        </div>
      )}
      {boxed.map((item, i) => {
        const b = item.box;
        const isActive = active === item.key;
        return (
          <motion.button
            key={item.key}
            type="button"
            aria-label={`Item ${i + 1}: ${resolveItem(item).display}`}
            onMouseEnter={() => onActive(item.key)}
            onMouseLeave={() => onActive(null)}
            onClick={() =>
              document
                .getElementById(`item-${item.key}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            initial={reduced ? false : { opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className={cn(
              "absolute rounded-[12px] border-[2.5px] transition-colors",
              isActive ? "border-[#fbf7f0] bg-[#fbf7f0]/10" : "border-dashed border-[#fbf7f0]/80",
              item.needsConfirmation && !item.confirmed && "border-[#f8e7c4]",
            )}
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
            }}
          >
            <span className="absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-[#c2410c] text-sm font-semibold text-white shadow-lift">
              {i + 1}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

export default function ScanPage() {
  useTitle("Scan a meal");
  const [params] = useSearchParams();
  const { user } = useAuth();
  const today = useToday();
  const timeZone = useTimeZone();
  const [state, dispatch] = useScanFlow();
  const [source, setSource] = useState<"camera" | "upload">(
    params.get("source") === "upload" ? "upload" : "camera",
  );
  const [active, setActive] = useState<string | null>(null);
  const [searchFor, setSearchFor] = useState<
    { kind: "new" } | { kind: "replace"; key: string } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const scan = useScan();
  const create = useCreateMeal();
  const insight = useMealInsight();
  const mealParam = params.get("meal") as MealType | null;

  // Release object URLs of photos we're done with.
  const imageUrl = state.stage === "capture" ? null : state.image.url;
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  const analyze = useCallback(
    async (blob: Blob) => {
      const image = await prepareForScan(blob);
      dispatch({ type: "analyze", image });
      try {
        const result = await scan.mutateAsync(image.blob);
        dispatch({
          type: "scanned",
          scan: result,
          mealType: mealParam ?? guessMealType(localHour(new Date(), timeZone)),
        });
      } catch (error) {
        dispatch({ type: "failed", error });
      }
    },
    [dispatch, scan, mealParam, timeZone],
  );

  const save = async () => {
    if (state.stage !== "review" || !user) return;
    setSaving(true);
    try {
      const photoPath = await uploadMealPhoto(user.uid, state.image.blob);
      const meal = await create.mutateAsync({
        localDate: today,
        mealType: state.mealType,
        source: "scan",
        photoPath,
        items: state.items.map(resolveItem),
      });
      dispatch({ type: "saved", meal });
      insight.mutate(meal.id);
    } catch (err) {
      toast.error("Couldn't save the meal", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (state.stage === "capture") {
    return (
      <div className="container-app max-w-3xl">
        <PageHeader
          eyebrow="Scan"
          title="What's on your plate?"
          description="One photo of the whole plate works best: good light, from slightly above."
          actions={
            <Segmented
              aria-label="Photo source"
              value={source}
              onValueChange={setSource}
              options={[
                {
                  value: "camera",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Camera className="size-4" /> Camera
                    </span>
                  ),
                },
                {
                  value: "upload",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <ImagePlus className="size-4" /> Upload
                    </span>
                  ),
                },
              ]}
            />
          }
        />
        {source === "camera" ? (
          <CameraCapture
            onCapture={(b) => void analyze(b)}
            onUseUpload={() => setSource("upload")}
          />
        ) : (
          <PhotoDrop onFile={(f) => void analyze(f)} />
        )}
      </div>
    );
  }

  if (state.stage === "analyzing" || state.stage === "failed") {
    const failure = state.stage === "failed" ? failureText(state.error) : null;
    return (
      <div className="container-app max-w-3xl">
        <PageHeader
          eyebrow="Scan"
          title={failure ? failure.title : "Finding the foods…"}
          description={failure?.detail ?? "This usually takes a second or two."}
        />
        <PhotoWithBoxes
          src={state.image.url}
          items={[]}
          active={null}
          onActive={setActive}
          analyzing={!failure}
        />
        {failure ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => void analyze(state.image.blob)}>
              <RotateCcw /> Try again
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: "reset" })}>
              Use another photo
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3" aria-live="polite">
            <span className="sr-only">Analysing your photo</span>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
      </div>
    );
  }

  if (state.stage === "saved") {
    const meal = state.meal;
    return (
      <div className="container-app max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid justify-items-center gap-4 pt-6 text-center"
        >
          <span className="grid size-16 place-items-center rounded-full bg-secondary-soft text-secondary">
            <CircleCheck className="size-9" />
          </span>
          <h1 className="text-[2.2rem] font-semibold">
            Logged to {MEAL_TYPES.find((m) => m.value === meal.mealType)?.label.toLowerCase()}
          </h1>
          <p className="text-ink-muted">
            <span className="font-display text-2xl font-semibold text-ink tabular">
              {kcal(meal.totals.kcal)}
            </span>{" "}
            kcal · {meal.items.map((i) => i.display).join(", ")}
          </p>
          <MacroInline macros={meal.totals} className="justify-center" />
        </motion.div>
        {(insight.isPending || insight.data) && (
          <Card className="mt-8 p-5" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-medium text-secondary">
              <Sparkles className="size-4" /> Nutri's take
            </div>
            {insight.data ? (
              <>
                <p className="mt-2 font-display text-xl font-semibold">{insight.data.headline}</p>
                <p className="mt-1 text-ink-muted">{insight.data.tip}</p>
                <p className="mt-3 text-sm">
                  <span className="font-medium">Next meal idea:</span>{" "}
                  {insight.data.nextMealSuggestion}
                </p>
              </>
            ) : (
              <div className="mt-3 grid gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4" />
              </div>
            )}
          </Card>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" size="lg" onClick={() => dispatch({ type: "reset" })}>
            <Camera /> Scan another
          </Button>
          <Button asChild size="lg">
            <Link to="/app">
              See today <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Review
  const total = sum(state.items.map(itemNutrition));
  const unresolved = state.items.filter((it) => it.needsConfirmation && !it.confirmed).length;
  return (
    <div className="container-app">
      <PageHeader
        eyebrow="Scan"
        title={
          state.items.length
            ? `I found ${state.items.length === 1 ? "one food" : `${state.items.length} foods`}`
            : "Nothing left on the plate"
        }
        description={
          state.scan.source === "full_image"
            ? "I couldn't outline separate foods, so I looked at the whole photo. Check the guess below."
            : "Check each one, adjust portions, then log the meal."
        }
        actions={
          <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
            <RotateCcw /> New photo
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <PhotoWithBoxes
            src={state.image.url}
            items={state.items}
            active={active}
            onActive={setActive}
          />
          <p className="mt-3 text-xs text-ink-subtle">
            Found in {Math.round(state.scan.timings.totalMs)} ms · portions are estimates from the
            photo
          </p>
        </div>
        <div className="grid gap-4">
          {state.items.map((item, i) => (
            <ReviewItemCard
              key={item.key}
              item={item}
              index={i}
              active={active === item.key}
              onActive={setActive}
              onChoose={(index) => dispatch({ type: "choose", key: item.key, index })}
              onGrams={(grams) => dispatch({ type: "grams", key: item.key, grams })}
              onSearch={() => setSearchFor({ kind: "replace", key: item.key })}
              onConfirm={() => dispatch({ type: "confirm", key: item.key })}
              onRemove={() => dispatch({ type: "remove", key: item.key })}
            />
          ))}
          <button
            type="button"
            onClick={() => setSearchFor({ kind: "new" })}
            className="flex h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-5" /> Add something it missed
          </button>

          <Card className="sticky bottom-20 z-10 grid gap-4 p-5 shadow-lift lg:bottom-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                aria-label="Meal"
                value={state.mealType}
                onValueChange={(mealType) => dispatch({ type: "mealType", mealType })}
                options={MEAL_TYPES}
                size="sm"
                className="flex-wrap"
              />
              <p className="font-display text-3xl font-semibold tabular">
                {kcal(total.kcal)}{" "}
                <span className="font-sans text-base font-medium text-ink-muted">kcal</span>
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => void save()}
              disabled={saving || state.items.length === 0}
            >
              {saving ? "Saving…" : unresolved ? `Log meal (${unresolved} to check)` : "Log meal"}
            </Button>
          </Card>
        </div>
      </div>
      <AddFoodSheet
        open={searchFor !== null}
        onOpenChange={(o) => !o && setSearchFor(null)}
        day={today}
        mealType={state.mealType}
        onPick={(item) => {
          if (searchFor?.kind === "new") dispatch({ type: "add", item });
          else if (searchFor) dispatch({ type: "replace", key: searchFor.key, item });
        }}
      />
    </div>
  );
}
