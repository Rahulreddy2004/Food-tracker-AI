import type { MealType } from "@/lib/api/types";

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Calendar day (YYYY-MM-DD) for `date` in `timeZone` — the diary's notion of "today". */
export function localDate(date: Date = new Date(), timeZone: string = browserTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour (0–23) in `timeZone`. */
export function localHour(date: Date = new Date(), timeZone: string = browserTimeZone()): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(date)
    .find((p) => p.type === "hour")?.value;
  return Number(hour ?? 12);
}

/** Add days to a YYYY-MM-DD string (calendar arithmetic, timezone-free). */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta));
  return utc.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Parse YYYY-MM-DD as a date at noon UTC, safe to format in any zone without shifting days. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return dayToDate(day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
    ...opts,
  });
}

export function relativeDayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatDay(day, { weekday: "short", month: "short", day: "numeric" });
}

export function guessMealType(hour: number): MealType {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export function greeting(hour: number): string {
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
];
