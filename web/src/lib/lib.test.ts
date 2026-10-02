import { describe, expect, it } from "vitest";

import { parseBlock, readSse } from "@/lib/api/sse";
import {
  addDays,
  daysBetween,
  guessMealType,
  localDate,
  localHour,
  relativeDayLabel,
} from "@/lib/dates";
import { energySplit, forGrams, sum } from "@/lib/nutrition";
import { bmr, suggestTargets } from "@/lib/targets";

describe("dates", () => {
  it("computes the calendar day in the user's time zone", () => {
    const instant = new Date("2026-10-01T20:30:00Z"); // 02:00 next day in India
    expect(localDate(instant, "Asia/Kolkata")).toBe("2026-10-02");
    expect(localDate(instant, "America/New_York")).toBe("2026-10-01");
    expect(localHour(instant, "Asia/Kolkata")).toBe(2);
  });

  it("does calendar arithmetic without DST surprises", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
    expect(relativeDayLabel("2026-10-01", "2026-10-02")).toBe("Yesterday");
  });

  it("guesses the meal from the hour", () => {
    expect(guessMealType(8)).toBe("breakfast");
    expect(guessMealType(13)).toBe("lunch");
    expect(guessMealType(19)).toBe("dinner");
    expect(guessMealType(23)).toBe("snack");
  });
});

describe("nutrition", () => {
  const pizza = { kcal: 266, proteinG: 11.4, fatG: 10.4, carbsG: 33 };

  it("scales per-100 g values like the API does", () => {
    expect(forGrams(pizza, 150)).toEqual({ kcal: 399, proteinG: 17.1, fatG: 15.6, carbsG: 49.5 });
  });

  it("sums macros and splits energy by Atwater factors", () => {
    expect(sum([pizza, pizza]).kcal).toBe(532);
    const split = energySplit({ kcal: 0, proteinG: 25, carbsG: 25, fatG: 0 });
    expect(split).toEqual({ proteinG: 0.5, carbsG: 0.5, fatG: 0 });
    expect(energySplit({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }).fatG).toBe(0);
  });
});

describe("targets", () => {
  it("matches the Mifflin–St Jeor formula", () => {
    // 10×70 + 6.25×175 − 5×30 + 5 = 1648.75
    expect(
      bmr({ sex: "male", age: 30, heightCm: 175, weightKg: 70, activity: "light" }),
    ).toBeCloseTo(1648.75);
    expect(
      bmr({ sex: "female", age: 30, heightCm: 165, weightKg: 60, activity: "light" }),
    ).toBeCloseTo(1320.25);
  });

  it("keeps macros consistent with calories and never goes below 1,200 kcal", () => {
    const t = suggestTargets("lose", {
      sex: "female",
      age: 70,
      heightCm: 150,
      weightKg: 42,
      activity: "sedentary",
    });
    expect(t.kcal).toBe(1200);
    const balanced = suggestTargets("maintain", {
      sex: "male",
      age: 22,
      heightCm: 178,
      weightKg: 72,
      activity: "moderate",
    });
    const fromMacros = balanced.proteinG * 4 + balanced.carbsG * 4 + balanced.fatG * 9;
    expect(Math.abs(fromMacros - balanced.kcal)).toBeLessThan(15);
    expect(suggestTargets("health").kcal).toBe(2000);
  });
});

describe("server-sent events", () => {
  it("parses event blocks", () => {
    expect(parseBlock('event: delta\ndata: {"text":"hi"}')).toEqual({
      event: "delta",
      data: '{"text":"hi"}',
    });
    expect(parseBlock(": keep-alive")).toBeNull();
  });

  it("reads events split across network chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: delta\ndata: {"te',
      'xt":"Hel"}\n\nevent: delta\r\ndata: {"text":"lo"}\r\n\r\n',
      "event: done\ndata: {}\n\n",
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    const events = [];
    for await (const e of readSse(body)) events.push(e);
    expect(events.map((e) => e.event)).toEqual(["delta", "delta", "done"]);
    expect(events.map((e) => e.data).join("|")).toBe('{"text":"Hel"}|{"text":"lo"}|{}');
  });
});
