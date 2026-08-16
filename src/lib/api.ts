import type { ApiError } from "@/types";
import { API_ERRORS, type ApiErrorCode } from "@/lib/errors";

// Uniform success envelope: { data } with the given status.
export function apiSuccess(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Uniform error envelope: { error: { code, message } }.
export function apiError(code: string, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Build an error response straight from a catalog code (status + message looked up).
export function apiErrorFrom(code: ApiErrorCode): Response {
  const { status, message } = API_ERRORS[code];
  return apiError(code, message, status);
}
