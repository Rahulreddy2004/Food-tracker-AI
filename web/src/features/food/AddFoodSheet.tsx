import { ArrowLeft, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FoodIcon, MacroInline } from "@/components/nutrition";
import { PortionEditor } from "@/components/PortionEditor";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ResponsiveSheet } from "@/components/ui/overlays";
import dishes from "@/data/dishes.json";
import { errorMessage } from "@/lib/api/client";
import { useCreateMeal, useFoodSearch, usePantry } from "@/lib/api/queries";
import type { FoodHit, Meal, MealItemIn, MealType } from "@/lib/api/types";
import { MEAL_TYPES } from "@/lib/dates";
import { forGrams, kcal, toMealItem } from "@/lib/nutrition";

interface AddFoodSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Diary day (YYYY-MM-DD) the meal is logged on. */
  day: string;
  mealType: MealType;
  /** When set, the picked food is handed back instead of being logged as its own meal. */
  onPick?: (item: MealItemIn) => void;
  onAdded?: (meal: Meal) => void;
}

function ResultRow({ hit, onSelect }: { hit: FoodHit; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        <FoodIcon group={hit.group} className="size-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{hit.display}</span>
          <span className="block truncate text-sm text-ink-muted">
            {hit.source === "pantry"
              ? `Your pantry · ${hit.servingLabel ?? `${Math.round(hit.servingG)} g`}`
              : hit.source === "calorieninjas"
                ? "From the nutrition database"
                : hit.group}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm tabular">
          <span className="font-semibold">{kcal(hit.per100g.kcal)}</span>
          <span className="text-ink-muted"> kcal/100 g</span>
        </span>
      </button>
    </li>
  );
}

export function AddFoodSheet({
  open,
  onOpenChange,
  day,
  mealType,
  onPick,
  onAdded,
}: AddFoodSheetProps) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState(100);
  const [type, setType] = useState<MealType>(mealType);
  const search = useFoodSearch(query);
  const pantry = usePantry();
  const create = useCreateMeal();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setPicked(null);
      setType(mealType);
    }
  }

  const pantryHits = useMemo<FoodHit[]>(
    () =>
      (pantry.data ?? [])
        .slice()
        .sort((a, b) => Number(b.favorite) - Number(a.favorite))
        .slice(0, 8)
        .map((f) => ({
          source: "pantry",
          id: f.id,
          name: f.name,
          display: f.name,
          group: "My pantry",
          per100g: f.per100g,
          servingG: f.servingG,
          servingLabel: f.servingLabel ?? null,
        })),
    [pantry.data],
  );

  const choose = (hit: FoodHit) => {
    setPicked(hit);
    setGrams(Math.round(hit.servingG));
  };

  const save = async () => {
    if (!picked) return;
    const item = toMealItem(picked, grams);
    if (onPick) {
      onPick(item);
      onOpenChange(false);
      return;
    }
    try {
      const meal = await create.mutateAsync({
        localDate: day,
        mealType: type,
        source: picked.source === "pantry" ? "pantry" : "search",
        items: [item],
      });
      toast.success(
        `${picked.display} added to ${MEAL_TYPES.find((m) => m.value === type)?.label.toLowerCase()}`,
      );
      onAdded?.(meal);
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't add that food", { description: errorMessage(err) });
    }
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={picked ? picked.display : onPick ? "Add a missing food" : "Add food"}
      description={
        picked
          ? "Set the portion, then add it."
          : `Search ${dishes.length} dishes, your pantry and a nutrition database.`
      }
    >
      {!picked ? (
        <div className="grid gap-4 pb-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              autoFocus
              aria-label="Search foods"
              placeholder="e.g. dosa, caesar salad, apple"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {showingSearch ? (
            search.isPending ? (
              <div className="grid gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : search.isError ? (
              <p className="text-sm text-danger">{errorMessage(search.error)}</p>
            ) : search.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">
                No matches. Try another word, or save it to your pantry with its label values.
              </p>
            ) : (
              <ul className="-mx-2 grid" aria-label="Search results">
                {search.data.map((hit) => (
                  <ResultRow
                    key={`${hit.source}-${hit.id ?? hit.name}`}
                    hit={hit}
                    onSelect={() => choose(hit)}
                  />
                ))}
              </ul>
            )
          ) : pantryHits.length > 0 ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-muted">
                <Star className="size-4" /> From your pantry
              </p>
              <ul className="-mx-2 grid">
                {pantryHits.map((hit) => (
                  <ResultRow key={hit.id} hit={hit} onSelect={() => choose(hit)} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-ink-muted">
              Type at least two letters to search.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 pb-2">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="inline-flex items-center gap-1.5 justify-self-start text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to search
          </button>
          <PortionEditor
            grams={grams}
            onChange={setGrams}
            servingG={picked.servingG}
            servingLabel={picked.servingLabel ?? null}
          />
          <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
            <MacroInline macros={forGrams(picked.per100g, grams)} />
            <p className="font-display text-2xl font-semibold tabular">
              {kcal(forGrams(picked.per100g, grams).kcal)}{" "}
              <span className="font-sans text-sm text-ink-muted">kcal</span>
            </p>
          </div>
          {!onPick && (
            <div className="grid gap-2">
              <span className="text-sm font-medium">Meal</span>
              <Segmented
                aria-label="Meal"
                value={type}
                onValueChange={setType}
                options={MEAL_TYPES}
                size="sm"
                className="flex-wrap"
              />
            </div>
          )}
          <Button size="lg" onClick={() => void save()} disabled={create.isPending}>
            {onPick ? "Add to this meal" : create.isPending ? "Adding…" : "Add to diary"}
          </Button>
        </div>
      )}
    </ResponsiveSheet>
  );
}
