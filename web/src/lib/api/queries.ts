import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { browserTimeZone, localDate } from "@/lib/dates";
import { API_URL } from "@/lib/env";

import { api, ApiError, authHeaders, call, type Problem } from "./client";
import { readSse } from "./sse";
import type {
  ChatMessage,
  Meal,
  MealIn,
  MealPatch,
  PantryIn,
  PantryPatch,
  Profile,
  ProfileIn,
  ScanResponse,
} from "./types";

export const keys = {
  profile: ["profile"] as const,
  meals: (from: string, to: string) => ["meals", from, to] as const,
  allMeals: ["meals"] as const,
  summary: (from: string, to: string) => ["summary", from, to] as const,
  allSummaries: ["summary"] as const,
  pantry: ["pantry"] as const,
  search: (q: string) => ["search", q] as const,
  barcode: (code: string) => ["barcode", code] as const,
  thread: ["coach", "thread"] as const,
};

// --- Profile -------------------------------------------------------------------------------------

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => call(api.GET("/v1/me/profile")),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
}

/** The user's timezone (from their profile, falling back to the browser). */
export function useTimeZone(): string {
  const { data } = useProfile();
  return data?.onboarded ? data.timezone : browserTimeZone();
}

export function useToday(): string {
  return localDate(new Date(), useTimeZone());
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileIn) => call(api.PUT("/v1/me/profile", { body })),
    onSuccess: (profile: Profile) => qc.setQueryData(keys.profile, profile),
  });
}

// --- Meals ---------------------------------------------------------------------------------------

export function useMeals(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.meals(from, to),
    queryFn: async () =>
      (await call(api.GET("/v1/meals", { params: { query: { from, to } } }))).meals,
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
}

export function useDailySummary(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.summary(from, to),
    queryFn: async () =>
      (await call(api.GET("/v1/summary/daily", { params: { query: { from, to } } }))).days,
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateDiary() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.allMeals }),
      qc.invalidateQueries({ queryKey: keys.allSummaries }),
    ]);
}

export function useCreateMeal() {
  const invalidate = useInvalidateDiary();
  return useMutation({
    mutationFn: (body: MealIn) => call(api.POST("/v1/meals", { body })),
    onSettled: invalidate,
  });
}

export function useUpdateMeal() {
  const invalidate = useInvalidateDiary();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MealPatch }) =>
      call(api.PATCH("/v1/meals/{meal_id}", { params: { path: { meal_id: id } }, body: patch })),
    onSettled: invalidate,
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  const invalidate = useInvalidateDiary();
  return useMutation({
    mutationFn: (meal: Meal) =>
      call(api.DELETE("/v1/meals/{meal_id}", { params: { path: { meal_id: meal.id } } })),
    // Remove it from every cached day straight away; undo re-creates it.
    onMutate: async (meal) => {
      await qc.cancelQueries({ queryKey: keys.allMeals });
      qc.setQueriesData<Meal[]>({ queryKey: keys.allMeals }, (old) =>
        old?.filter((m) => m.id !== meal.id),
      );
    },
    onSettled: invalidate,
  });
}

// --- Pantry --------------------------------------------------------------------------------------

export function usePantry() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.pantry,
    queryFn: async () => (await call(api.GET("/v1/pantry"))).foods,
    enabled: Boolean(user),
  });
}

export function useSavePantryFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: PantryIn | PantryPatch }) =>
      id
        ? call(
            api.PATCH("/v1/pantry/{food_id}", {
              params: { path: { food_id: id } },
              body: body,
            }),
          )
        : call(api.POST("/v1/pantry", { body: body as PantryIn })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.pantry }),
  });
}

export function useDeletePantryFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE("/v1/pantry/{food_id}", { params: { path: { food_id: id } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.pantry }),
  });
}

// --- Foods, barcode, scan ---------------------------------------------------------------------------

export function useFoodSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: keys.search(q.toLowerCase()),
    queryFn: async () =>
      (await call(api.GET("/v1/foods/search", { params: { query: { q } } }))).results,
    enabled: q.length >= 2,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useBarcode(code: string | null) {
  return useQuery({
    queryKey: keys.barcode(code ?? ""),
    queryFn: () => call(api.GET("/v1/barcode/{code}", { params: { path: { code: code ?? "" } } })),
    enabled: Boolean(code),
    staleTime: 60 * 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
  });
}

export function useScan() {
  return useMutation({
    mutationFn: async (image: Blob): Promise<ScanResponse> => {
      const form = new FormData();
      form.append("image", image, "meal.jpg");
      return call(
        api.POST("/v1/scan", {
          // openapi-fetch sends FormData untouched when bodySerializer returns it.
          body: form as unknown as { image: string },
          bodySerializer: (b) => b as unknown as FormData,
        }),
      );
    },
  });
}

// --- Coach ---------------------------------------------------------------------------------------

export function useCoachThread() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.thread,
    queryFn: async () => (await call(api.GET("/v1/coach/thread"))).messages,
    enabled: Boolean(user),
    retry: (count, err) => !(err instanceof ApiError && err.status === 503) && count < 2,
  });
}

export function useClearThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.DELETE("/v1/coach/thread")),
    onSuccess: () => qc.setQueryData<ChatMessage[]>(keys.thread, []),
  });
}

export function useMealInsight() {
  return useMutation({
    mutationFn: (mealId: string) => call(api.POST("/v1/coach/meal-insight", { body: { mealId } })),
  });
}

/**
 * Stream a coach reply. Calls `onDelta` for each piece of text. Resolves with the full reply.
 * Throws ApiError for HTTP errors and for an `error` event mid-stream.
 */
export async function streamCoachReply(
  message: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/coach/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ message }),
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError({ title: "Can't reach the coach", status: 0, code: "network_error" });
  }
  if (!response.ok || !response.body) {
    const problem = (await response.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      problem ?? { title: "The coach couldn't reply", status: response.status, code: "http_error" },
    );
  }
  let full = "";
  for await (const event of readSse(response.body)) {
    if (event.event === "delta") {
      const { text } = JSON.parse(event.data) as { text: string };
      full += text;
      onDelta(text);
    } else if (event.event === "error") {
      const { code, title } = JSON.parse(event.data) as { code: string; title: string };
      throw new ApiError({ title, code, status: 502 });
    }
  }
  return full;
}
