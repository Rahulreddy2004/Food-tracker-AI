import { describe, expect, it } from "vitest";

import type { ScanResponse } from "@/lib/api/types";
import type { PreparedImage } from "@/lib/image";

import {
  confidenceLabel,
  itemNutrition,
  resolveItem,
  scanReducer,
  type ScanState,
} from "./useScanFlow";

const image: PreparedImage = { blob: new Blob(), url: "blob:x", width: 640, height: 480 };
const per100 = (kcal: number) => ({ kcal, proteinG: 10, fatG: 5, carbsG: 20 });

const scan: ScanResponse = {
  scanId: "s1",
  width: 640,
  height: 480,
  source: "detector",
  timings: { decodeMs: 1, detectMs: 2, classifyMs: 3, totalMs: 6 },
  models: { detector: "fake", classifier: "fake", demo: true },
  items: [
    {
      id: "a",
      box: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      detectorScore: 0.9,
      needsConfirmation: false,
      predictions: [
        {
          label: "pizza",
          display: "Pizza",
          group: "Pizza",
          confidence: 0.8,
          per100g: per100(266),
          suggestedGrams: 200,
          portionMethod: "box_area",
        },
        {
          label: "lasagna",
          display: "Lasagna",
          group: "Pasta",
          confidence: 0.1,
          per100g: per100(165),
          suggestedGrams: 300,
          portionMethod: "box_area",
        },
      ],
    },
    {
      id: "b",
      box: { x: 0.6, y: 0.6, w: 0.3, h: 0.3 },
      detectorScore: 0.6,
      needsConfirmation: true,
      predictions: [
        {
          label: "french_fries",
          display: "French fries",
          group: "Side Dish",
          confidence: 0.34,
          per100g: per100(312),
          suggestedGrams: 120,
          portionMethod: "box_area",
        },
      ],
    },
  ],
};

function reviewed(): Extract<ScanState, { stage: "review" }> {
  let state: ScanState = scanReducer({ stage: "capture" }, { type: "analyze", image });
  state = scanReducer(state, { type: "scanned", scan, mealType: "lunch" });
  if (state.stage !== "review") throw new Error("expected review");
  return state;
}

describe("scan review flow", () => {
  it("starts from the model's best guesses and portions", () => {
    const state = reviewed();
    expect(state.items.map((i) => [i.grams, i.confirmed])).toEqual([
      [200, true],
      [120, false],
    ]);
    expect(resolveItem(state.items[0]!).name).toBe("pizza");
  });

  it("switching guess updates the portion until the user moves the slider", () => {
    let state: ScanState = scanReducer(reviewed(), { type: "choose", key: "a", index: 1 });
    if (state.stage !== "review") throw new Error();
    expect(state.items[0]!.grams).toBe(300);
    state = scanReducer(state, { type: "grams", key: "a", grams: 180 });
    state = scanReducer(state, { type: "choose", key: "a", index: 0 });
    if (state.stage !== "review") throw new Error();
    expect(state.items[0]!.grams).toBe(180);
    expect(itemNutrition(state.items[0]!).kcal).toBe(478.8);
  });

  it("replacing, adding and removing foods", () => {
    const custom = { name: "dal", display: "Dal", grams: 250, per100g: per100(120) };
    let state: ScanState = scanReducer(reviewed(), { type: "replace", key: "b", item: custom });
    state = scanReducer(state, {
      type: "add",
      item: { ...custom, name: "roti", display: "Roti", grams: 40 },
    });
    state = scanReducer(state, { type: "remove", key: "a" });
    if (state.stage !== "review") throw new Error();
    expect(state.items.map((i) => resolveItem(i).display)).toEqual(["Dal", "Roti"]);
    expect(state.items[0]!.confirmed).toBe(true);
    // The replaced item keeps its box so the photo still shows where it was.
    expect(resolveItem(state.items[0]!).box).toEqual(scan.items[1]!.box);
  });

  it("labels confidence honestly", () => {
    expect(confidenceLabel(0.9).text).toBe("Pretty sure");
    expect(confidenceLabel(0.5).text).toBe("Best guess");
    expect(confidenceLabel(0.2).text).toBe("Not sure");
  });
});
