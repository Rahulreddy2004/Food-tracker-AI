import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";

import { FoodIcon, MacroInline } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import type { Meal, MealType } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { MEAL_TYPES } from "@/lib/dates";
import { kcal } from "@/lib/nutrition";
import { usePhotoUrl } from "@/lib/photos";

function MealThumb({ meal }: { meal: Meal }) {
  const photo = usePhotoUrl(meal.photoPath);
  if (photo.data) {
    return (
      <img
        src={photo.data}
        alt=""
        className="size-16 shrink-0 rounded-md object-cover sm:size-20"
        loading="lazy"
      />
    );
  }
  return <FoodIcon group={meal.items[0]?.group} className="size-16 sm:size-20" />;
}

function timeOf(meal: Meal, timeZone: string): string {
  return new Date(meal.eatenAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

interface MealCardProps {
  meal: Meal;
  timeZone: string;
  onEdit?: (meal: Meal) => void;
  onDelete?: (meal: Meal) => void;
}

export function MealCard({ meal, timeZone, onEdit, onDelete }: MealCardProps) {
  const title = meal.items.map((i) => i.display).join(", ");
  const item =
    "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-4";
  return (
    <article className="flex gap-4 rounded-lg border border-line bg-surface p-3 shadow-soft sm:p-4">
      <MealThumb meal={meal} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 font-sans text-[0.98rem] leading-snug font-semibold">
            {title}
          </h4>
          <p className="shrink-0 font-display text-lg leading-none font-semibold tabular">
            {kcal(meal.totals.kcal)}
            <span className="ml-0.5 font-sans text-xs font-medium text-ink-muted"> kcal</span>
          </p>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {timeOf(meal, timeZone)} ·{" "}
          {meal.items.length === 1
            ? `${Math.round(meal.items[0]?.grams ?? 0)} g`
            : `${meal.items.length} foods`}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <MacroInline macros={meal.totals} />
          {(onEdit || onDelete) && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${title}`}>
                  <Ellipsis />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-40 rounded-lg border border-line bg-surface p-1.5 shadow-lift"
                >
                  {onEdit && (
                    <DropdownMenu.Item className={item} onSelect={() => onEdit(meal)}>
                      <Pencil className="text-ink-muted" /> Edit
                    </DropdownMenu.Item>
                  )}
                  {onDelete && (
                    <DropdownMenu.Item
                      className={cn(item, "text-danger")}
                      onSelect={() => onDelete(meal)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenu.Item>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>
    </article>
  );
}

interface MealSectionsProps {
  meals: Meal[];
  timeZone: string;
  onAdd: (mealType: MealType) => void;
  onEdit?: (meal: Meal) => void;
  onDelete?: (meal: Meal) => void;
  emptyHint?: ReactNode;
}

/** Meals grouped as Breakfast / Lunch / Dinner / Snacks, each with its own add button. */
export function MealSections({ meals, timeZone, onAdd, onEdit, onDelete }: MealSectionsProps) {
  return (
    <div className="grid gap-7">
      {MEAL_TYPES.map(({ value, label }) => {
        const group = meals.filter((m) => m.mealType === value);
        const total = group.reduce((acc, m) => acc + m.totals.kcal, 0);
        return (
          <section key={value} aria-labelledby={`meal-${value}`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 id={`meal-${value}`} className="text-xl font-semibold">
                {label}
              </h3>
              <span className="text-sm text-ink-muted tabular">
                {group.length ? `${kcal(total)} kcal` : ""}
              </span>
            </div>
            <div className="grid gap-3">
              {group.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  timeZone={timeZone}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
              <button
                type="button"
                onClick={() => onAdd(value)}
                className="flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-ink-muted transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary-ink"
              >
                <Plus className="size-4" /> Add {label.toLowerCase()}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
