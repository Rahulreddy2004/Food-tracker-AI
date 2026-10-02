import type { Goal, Targets } from "@/lib/api/types";

export type Sex = "female" | "male";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const ACTIVITY: { value: Activity; label: string; hint: string; factor: number }[] = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk job, little exercise", factor: 1.2 },
  {
    value: "light",
    label: "Lightly active",
    hint: "Walks, exercise 1–3 days a week",
    factor: 1.375,
  },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 days a week", factor: 1.55 },
  { value: "active", label: "Very active", hint: "Hard exercise 6–7 days a week", factor: 1.725 },
  {
    value: "very_active",
    label: "Athlete",
    hint: "Training twice a day or physical job",
    factor: 1.9,
  },
];

export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "lose", label: "Lose weight", hint: "A gentle 15% calorie deficit" },
  { value: "maintain", label: "Maintain", hint: "Eat about what you burn" },
  { value: "gain", label: "Build muscle", hint: "A small surplus with more protein" },
  { value: "health", label: "Eat healthier", hint: "Balance, without counting obsessively" },
];

export interface BodyInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
}

/** Mifflin–St Jeor resting energy (kcal/day). */
export function bmr({ sex, age, heightCm, weightKg }: BodyInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function tdee(body: BodyInput): number {
  const factor = ACTIVITY.find((a) => a.value === body.activity)?.factor ?? 1.375;
  return bmr(body) * factor;
}

const GOAL_FACTOR: Record<Goal, number> = { lose: 0.85, maintain: 1, gain: 1.1, health: 1 };

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Daily targets. Never suggests below 1,200 kcal. */
export function suggestTargets(goal: Goal, body?: BodyInput | null): Targets {
  const energy = body ? tdee(body) * GOAL_FACTOR[goal] : 2000;
  const kcal = Math.max(1200, round(energy, 10));
  const proteinPerKg = goal === "gain" ? 1.8 : goal === "lose" ? 1.6 : 1.2;
  const proteinG = body
    ? round(Math.min(body.weightKg * proteinPerKg, (kcal * 0.35) / 4), 1)
    : round((kcal * 0.2) / 4, 1);
  const fatG = round((kcal * 0.3) / 9, 1);
  const carbsG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4, 1));
  return { kcal, proteinG, fatG, carbsG };
}
