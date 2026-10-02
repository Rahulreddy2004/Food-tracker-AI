import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FoodIcon } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { ResponsiveSheet } from "@/components/ui/overlays";
import { errorMessage } from "@/lib/api/client";
import { useUpdateMeal } from "@/lib/api/queries";
import type { Meal, MealItemIn, MealType } from "@/lib/api/types";
import { MEAL_TYPES } from "@/lib/dates";
import { forGrams, kcal, sum } from "@/lib/nutrition";

export function EditMealSheet({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const update = useUpdateMeal();
  const [items, setItems] = useState<MealItemIn[]>([]);
  const [type, setType] = useState<MealType>("lunch");
  const [day, setDay] = useState("");

  const [loaded, setLoaded] = useState<Meal | null>(null);
  if (meal && meal !== loaded) {
    setLoaded(meal);
    setItems(meal.items.map(({ nutrition: _n, ...rest }) => rest));
    setType(meal.mealType);
    setDay(meal.localDate);
  }

  const setGrams = (index: number, grams: number) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, grams: Math.min(Math.max(Math.round(grams), 1), 5000) } : it,
      ),
    );

  const total = sum(items.map((it) => forGrams(it.per100g, it.grams)));

  const save = async () => {
    if (!meal) return;
    try {
      await update.mutateAsync({ id: meal.id, patch: { items, mealType: type, localDate: day } });
      toast.success("Meal updated");
      onClose();
    } catch (err) {
      toast.error("Couldn't save changes", { description: errorMessage(err) });
    }
  };

  return (
    <ResponsiveSheet
      open={meal !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Edit meal"
      description="Adjust portions, remove foods, or move the meal."
    >
      <div className="grid gap-5 pb-2">
        <ul className="grid gap-3">
          {items.map((item, i) => (
            <li
              key={`${item.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-line p-3"
            >
              <FoodIcon group={item.group} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.display}</p>
                <p className="text-sm text-ink-muted tabular">
                  {kcal(forGrams(item.per100g, item.grams).kcal)} kcal
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Less ${item.display}`}
                  onClick={() => setGrams(i, item.grams - 10)}
                >
                  <Minus />
                </Button>
                <Input
                  aria-label={`${item.display} grams`}
                  type="number"
                  value={Math.round(item.grams)}
                  onChange={(e) => setGrams(i, Number(e.target.value) || 1)}
                  className="h-9 w-16 px-2 text-center tabular"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More ${item.display}`}
                  onClick={() => setGrams(i, item.grams + 10)}
                >
                  <Plus />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${item.display}`}
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
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
        <label className="grid gap-1.5 text-sm font-medium">
          Day
          <Input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            max="2100-12-31"
          />
        </label>
        <div className="flex items-center justify-between">
          <p className="text-ink-muted">
            Total{" "}
            <span className="font-display text-xl font-semibold text-ink tabular">
              {kcal(total.kcal)}
            </span>{" "}
            kcal
          </p>
          <Button
            onClick={() => void save()}
            disabled={update.isPending || items.length === 0 || !day}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
