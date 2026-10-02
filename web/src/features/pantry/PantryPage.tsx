import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, ErrorState, PageHeader } from "@/components/layout";
import { FoodIcon, MacroInline } from "@/components/nutrition";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent, ResponsiveSheet } from "@/components/ui/overlays";
import { errorMessage } from "@/lib/api/client";
import {
  useCreateMeal,
  useDeleteMeal,
  useDeletePantryFood,
  usePantry,
  useSavePantryFood,
  useTimeZone,
  useToday,
} from "@/lib/api/queries";
import type { PantryFood } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { guessMealType, localHour } from "@/lib/dates";
import { kcal } from "@/lib/nutrition";
import { useTitle } from "@/lib/useTitle";

// Empty inputs must show "Enter …", not silently become 0.
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const num = (label: string, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: `Enter ${label}` })
      .min(0, "Can't be negative")
      .max(max, `That's more than ${max}`),
  );

const schema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  servingLabel: z.string().trim().max(40).optional(),
  servingG: z.preprocess(
    blankToUndefined,
    z.coerce.number({ error: "Enter the serving weight" }).gt(0, "Must be above 0").max(3000),
  ),
  kcal: num("calories", 20000),
  proteinG: num("protein", 2000),
  fatG: num("fat", 2000),
  carbsG: num("carbs", 2000),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

function PantryForm({ food, onDone }: { food: PantryFood | null; onDone: () => void }) {
  const save = useSavePantryFood();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: food
      ? {
          name: food.name,
          servingLabel: food.servingLabel ?? "",
          servingG: food.servingG,
          kcal: food.perServing.kcal,
          proteinG: food.perServing.proteinG,
          fatG: food.perServing.fatG,
          carbsG: food.perServing.carbsG,
        }
      : { name: "", servingLabel: "", servingG: 100, kcal: "", proteinG: "", fatG: "", carbsG: "" },
  });
  const values = useWatch({ control: form.control });
  const atwater =
    4 * Number(values.proteinG || 0) +
    4 * Number(values.carbsG || 0) +
    9 * Number(values.fatG || 0);
  const entered = Number(values.kcal || 0);
  const mismatch = entered > 0 && atwater > 0 && Math.abs(atwater - entered) / entered > 0.25;
  const err = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      name: v.name,
      servingLabel: v.servingLabel || null,
      servingG: v.servingG,
      perServing: { kcal: v.kcal, proteinG: v.proteinG, fatG: v.fatG, carbsG: v.carbsG },
    };
    try {
      await save.mutateAsync(food ? { id: food.id, body } : { body: { ...body, favorite: false } });
      toast.success(food ? "Food updated" : `${v.name} added to your pantry`);
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: errorMessage(e) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 pb-2" noValidate>
      <Field label="Name" error={err.name?.message}>
        {(p) => (
          <Input
            placeholder="e.g. Mom's rajma chawal"
            autoFocus
            {...p}
            {...form.register("name")}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving" hint="Optional, e.g. “1 bowl”" error={err.servingLabel?.message}>
          {(p) => <Input placeholder="1 bowl" {...p} {...form.register("servingLabel")} />}
        </Field>
        <Field label="Serving weight (g)" error={err.servingG?.message}>
          {(p) => <Input type="number" inputMode="decimal" {...p} {...form.register("servingG")} />}
        </Field>
      </div>
      <p className="-mb-1 text-sm font-medium">Per serving</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["kcal", "Calories"],
            ["proteinG", "Protein g"],
            ["carbsG", "Carbs g"],
            ["fatG", "Fat g"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} error={err[key]?.message}>
            {(p) => (
              <Input type="number" inputMode="decimal" step="any" {...p} {...form.register(key)} />
            )}
          </Field>
        ))}
      </div>
      {mismatch && (
        <p className="rounded-md bg-accent-soft px-3 py-2 text-sm">
          The macros add up to about {kcal(atwater)} kcal. Double-check the label — it's fine to
          save anyway.
        </p>
      )}
      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending ? "Saving…" : food ? "Save changes" : "Add to pantry"}
      </Button>
    </form>
  );
}

export default function PantryPage() {
  useTitle("Pantry");
  const [params, setParams] = useSearchParams();
  const pantry = usePantry();
  const save = useSavePantryFood();
  const remove = useDeletePantryFood();
  const createMeal = useCreateMeal();
  const deleteMeal = useDeleteMeal();
  const today = useToday();
  const timeZone = useTimeZone();
  const [editing, setEditing] = useState<PantryFood | "new" | null>(
    params.get("new") ? "new" : null,
  );
  const [confirmDelete, setConfirmDelete] = useState<PantryFood | null>(null);
  const [query, setQuery] = useState("");

  const foods = useMemo(() => {
    const list = (pantry.data ?? []).filter((f) =>
      f.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return list.sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    );
  }, [pantry.data, query]);

  const closeSheet = () => {
    setEditing(null);
    if (params.get("new")) setParams({}, { replace: true });
  };

  const logNow = async (food: PantryFood) => {
    try {
      const meal = await createMeal.mutateAsync({
        localDate: today,
        mealType: guessMealType(localHour(new Date(), timeZone)),
        source: "pantry",
        items: [
          {
            name: food.name,
            display: food.name,
            group: "My pantry",
            grams: food.servingG,
            per100g: food.per100g,
          },
        ],
      });
      toast.success(`${food.name} logged`, {
        description: `${kcal(food.perServing.kcal)} kcal · ${food.servingLabel ?? `${Math.round(food.servingG)} g`}`,
        action: { label: "Undo", onClick: () => deleteMeal.mutate(meal) },
      });
    } catch (e) {
      toast.error("Couldn't log it", { description: errorMessage(e) });
    }
  };

  return (
    <div className="container-app max-w-4xl">
      <PageHeader
        title="Your pantry"
        description="Family recipes and regular foods, saved once and logged in a tap."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add a food
          </Button>
        }
      />
      {pantry.isError ? (
        <ErrorState message={errorMessage(pantry.error)} onRetry={() => void pantry.refetch()} />
      ) : pantry.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : pantry.data.length === 0 ? (
        <EmptyState
          title="Nothing in your pantry yet"
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add your first food
            </Button>
          }
        >
          Add the dishes you eat often — with their label or recipe values — and log them without a
          photo.
        </EmptyState>
      ) : (
        <>
          <div className="relative mb-5 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              aria-label="Filter your pantry"
              placeholder="Filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {foods.map((food) => (
              <li
                key={food.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-soft"
              >
                <FoodIcon group="My pantry" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{food.name}</p>
                  <p className="text-sm text-ink-muted tabular">
                    {kcal(food.perServing.kcal)} kcal ·{" "}
                    {food.servingLabel ?? `${Math.round(food.servingG)} g`}
                  </p>
                  <MacroInline macros={food.perServing} className="mt-1 text-xs" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        food.favorite ? `Unfavourite ${food.name}` : `Favourite ${food.name}`
                      }
                      aria-pressed={food.favorite}
                      onClick={() =>
                        save.mutate({ id: food.id, body: { favorite: !food.favorite } })
                      }
                    >
                      <Star className={cn(food.favorite && "fill-accent text-accent")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${food.name}`}
                      onClick={() => setEditing(food)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${food.name}`}
                      onClick={() => setConfirmDelete(food)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => void logNow(food)}>
                    Log
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(o) => !o && closeSheet()}
        title={editing === "new" ? "Add a food" : "Edit food"}
        description="Values per serving, from the label or your recipe."
      >
        {editing !== null && (
          <PantryForm food={editing === "new" ? null : editing} onDone={closeSheet} />
        )}
      </ResponsiveSheet>

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent
          title={`Delete ${confirmDelete?.name ?? "this food"}?`}
          description="Meals you already logged keep their values."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) remove.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
