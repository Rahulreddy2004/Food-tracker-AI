import { useState } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api/client";
import { useCreateMeal, useDeleteMeal } from "@/lib/api/queries";
import type { Meal } from "@/lib/api/types";

/** Delete with an Undo toast (undo re-logs the same meal), plus edit-sheet state. */
export function useMealActions() {
  const remove = useDeleteMeal();
  const create = useCreateMeal();
  const [editing, setEditing] = useState<Meal | null>(null);

  const onDelete = (meal: Meal) => {
    remove.mutate(meal, {
      onSuccess: () =>
        toast("Meal deleted", {
          action: {
            label: "Undo",
            onClick: () =>
              create.mutate({
                localDate: meal.localDate,
                mealType: meal.mealType,
                eatenAt: meal.eatenAt,
                source: meal.source,
                photoPath: meal.photoPath ?? null,
                note: meal.note ?? null,
                items: meal.items.map(({ nutrition: _n, ...item }) => item),
              }),
          },
        }),
      onError: (err) => toast.error("Couldn't delete", { description: errorMessage(err) }),
    });
  };

  return { onDelete, onEdit: setEditing, editing, closeEdit: () => setEditing(null) };
}
