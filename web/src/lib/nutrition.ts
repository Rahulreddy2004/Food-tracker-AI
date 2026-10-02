import type { FoodHit, Macros, MealItemIn } from "@/lib/api/types";

export const ZERO: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** `per100g` scaled to `grams` (same rounding as the API). */
export function forGrams(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: r1(per100g.kcal * f),
    proteinG: r1(per100g.proteinG * f),
    fatG: r1(per100g.fatG * f),
    carbsG: r1(per100g.carbsG * f),
  };
}

export function sum(list: Macros[]): Macros {
  return list.reduce<Macros>(
    (acc, m) => ({
      kcal: r1(acc.kcal + m.kcal),
      proteinG: r1(acc.proteinG + m.proteinG),
      fatG: r1(acc.fatG + m.fatG),
      carbsG: r1(acc.carbsG + m.carbsG),
    }),
    ZERO,
  );
}

const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function kcal(n: number): string {
  return intFmt.format(Math.round(n));
}

export function grams(n: number): string {
  return `${intFmt.format(Math.round(n))} g`;
}

export const MACROS = [
  { key: "proteinG", label: "Protein", color: "var(--protein)", className: "bg-protein" },
  { key: "carbsG", label: "Carbs", color: "var(--carbs)", className: "bg-carbs" },
  { key: "fatG", label: "Fat", color: "var(--fat)", className: "bg-fat" },
] as const satisfies readonly {
  key: keyof Macros;
  label: string;
  color: string;
  className: string;
}[];

/** Share of energy from each macro (Atwater 4/4/9), for split bars. */
export function energySplit(m: Macros): { proteinG: number; carbsG: number; fatG: number } {
  const p = m.proteinG * 4,
    c = m.carbsG * 4,
    f = m.fatG * 9;
  const total = p + c + f;
  if (total <= 0) return { proteinG: 0, carbsG: 0, fatG: 0 };
  return { proteinG: p / total, carbsG: c / total, fatG: f / total };
}

export function toMealItem(hit: FoodHit, grams: number): MealItemIn {
  return {
    name: hit.name,
    display: hit.display,
    group: hit.group ?? null,
    label: hit.source === "food101" ? hit.name : null,
    grams,
    per100g: hit.per100g,
  };
}
