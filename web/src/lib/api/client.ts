import createClient, { type Middleware } from "openapi-fetch";

import { currentIdToken } from "@/lib/auth";
import { API_URL } from "@/lib/env";

import type { paths } from "./schema";

/** The API's error body (RFC 9457 problem+json). */
export interface Problem {
  title: string;
  status: number;
  code: string;
  detail?: string;
  requestId?: string;
  errors?: { loc: (string | number)[]; msg: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
    this.detail = problem.detail;
    this.requestId = problem.requestId;
  }

  /** One short sentence that is safe to show to people. */
  get friendly(): string {
    return this.detail ? `${this.message}. ${this.detail}` : this.message;
  }
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await currentIdToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_URL });
api.use(authMiddleware);

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await currentIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function toApiError(error: unknown, response: Response): ApiError {
  if (error && typeof error === "object" && "code" in error && "title" in error) {
    return new ApiError(error as Problem);
  }
  return new ApiError({
    title: response.status >= 500 ? "The server had a problem" : "Request failed",
    status: response.status,
    code: "http_error",
  });
}

/** Unwrap an openapi-fetch result: return data or throw a typed ApiError. */
export async function call<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await promise;
  } catch {
    throw new ApiError({
      title: "Can't reach the server",
      status: 0,
      code: "network_error",
      detail: "Check your connection and try again.",
    });
  }
  if (result.error !== undefined || !result.response.ok)
    throw toApiError(result.error, result.response);
  return result.data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.friendly;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
