import { useReducer } from "react";

import type {
  Meal,
  MealItemIn,
  MealType,
  NormBox,
  Prediction,
  ScanResponse,
} from "@/lib/api/types";
import type { PreparedImage } from "@/lib/image";
import { forGrams } from "@/lib/nutrition";

/** One food on the review screen: a detected item (with guesses) or something the user added. */
export interface ReviewItem {
  key: string;
  box: NormBox | null;
  predictions: Prediction[];
  /** Index into `predictions`, or -1 when `custom` replaces the guesses. */
  choice: number;
  custom: MealItemIn | null;
  grams: number;
  gramsTouched: boolean;
  needsConfirmation: boolean;
  confirmed: boolean;
}

export type ScanState =
  | { stage: "capture" }
  | { stage: "analyzing"; image: PreparedImage }
  | { stage: "failed"; image: PreparedImage; error: unknown }
  | {
      stage: "review";
      image: PreparedImage;
      scan: ScanResponse;
      items: ReviewItem[];
      mealType: MealType;
    }
  | { stage: "saved"; image: PreparedImage; meal: Meal };

type Action =
  | { type: "analyze"; image: PreparedImage }
  | { type: "failed"; error: unknown }
  | { type: "scanned"; scan: ScanResponse; mealType: MealType }
  | { type: "choose"; key: string; index: number }
  | { type: "replace"; key: string; item: MealItemIn }
  | { type: "grams"; key: string; grams: number }
  | { type: "confirm"; key: string }
  | { type: "remove"; key: string }
  | { type: "add"; item: MealItemIn }
  | { type: "mealType"; mealType: MealType }
  | { type: "saved"; meal: Meal }
  | { type: "reset" };

function updateItem(
  state: ScanState,
  key: string,
  fn: (item: ReviewItem) => ReviewItem,
): ScanState {
  if (state.stage !== "review") return state;
  return { ...state, items: state.items.map((it) => (it.key === key ? fn(it) : it)) };
}

function reducer(state: ScanState, action: Action): ScanState {
  switch (action.type) {
    case "analyze":
      return { stage: "analyzing", image: action.image };
    case "failed":
      return state.stage === "analyzing"
        ? { stage: "failed", image: state.image, error: action.error }
        : state;
    case "scanned": {
      if (state.stage !== "analyzing") return state;
      const items = action.scan.items.map<ReviewItem>((it) => ({
        key: it.id,
        box: it.box ?? null,
        predictions: it.predictions,
        choice: 0,
        custom: null,
        grams: it.predictions[0]?.suggestedGrams ?? 100,
        gramsTouched: false,
        needsConfirmation: it.needsConfirmation,
        confirmed: !it.needsConfirmation,
      }));
      return {
        stage: "review",
        image: state.image,
        scan: action.scan,
        items,
        mealType: action.mealType,
      };
    }
    case "choose":
      return updateItem(state, action.key, (it) => ({
        ...it,
        choice: action.index,
        custom: null,
        confirmed: true,
        grams: it.gramsTouched
          ? it.grams
          : (it.predictions[action.index]?.suggestedGrams ?? it.grams),
      }));
    case "replace":
      return updateItem(state, action.key, (it) => ({
        ...it,
        choice: -1,
        custom: action.item,
        confirmed: true,
        grams: it.gramsTouched ? it.grams : action.item.grams,
      }));
    case "grams":
      return updateItem(state, action.key, (it) => ({
        ...it,
        grams: action.grams,
        gramsTouched: true,
      }));
    case "confirm":
      return updateItem(state, action.key, (it) => ({ ...it, confirmed: true }));
    case "remove":
      return state.stage === "review"
        ? { ...state, items: state.items.filter((it) => it.key !== action.key) }
        : state;
    case "add":
      if (state.stage !== "review") return state;
      return {
        ...state,
        items: [
          ...state.items,
          {
            key: crypto.randomUUID(),
            box: null,
            predictions: [],
            choice: -1,
            custom: action.item,
            grams: action.item.grams,
            gramsTouched: true,
            needsConfirmation: false,
            confirmed: true,
          },
        ],
      };
    case "mealType":
      return state.stage === "review" ? { ...state, mealType: action.mealType } : state;
    case "saved":
      return state.stage === "review"
        ? { stage: "saved", image: state.image, meal: action.meal }
        : state;
    case "reset":
      return { stage: "capture" };
  }
}

export function useScanFlow() {
  return useReducer(reducer, { stage: "capture" } as ScanState);
}

/** What the item currently represents, normalised for display and saving. */
export function resolveItem(it: ReviewItem): MealItemIn {
  if (it.custom) return { ...it.custom, grams: it.grams, box: it.box };
  const p = it.predictions[it.choice] ?? it.predictions[0];
  if (!p) throw new Error("Review item has no prediction");
  return {
    name: p.label,
    display: p.display,
    group: p.group,
    label: p.label,
    confidence: p.confidence,
    grams: it.grams,
    estimatedGrams: p.suggestedGrams,
    per100g: p.per100g,
    box: it.box,
  };
}

export function itemNutrition(it: ReviewItem) {
  const resolved = resolveItem(it);
  return forGrams(resolved.per100g, resolved.grams);
}

export function confidenceLabel(confidence: number): {
  text: string;
  tone: "secondary" | "accent" | "danger";
} {
  if (confidence >= 0.75) return { text: "Pretty sure", tone: "secondary" };
  if (confidence >= 0.4) return { text: "Best guess", tone: "accent" };
  return { text: "Not sure", tone: "danger" };
}
