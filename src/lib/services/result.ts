import type { ServiceResult } from "@/types";
import { API_ERRORS, type ApiErrorCode } from "@/lib/errors";

export function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

// Failure named by code; status + message come from the central catalog.
export function failure(code: ApiErrorCode): { ok: false; code: ApiErrorCode; status: number; message: string } {
  const { status, message } = API_ERRORS[code];
  return { ok: false, code, status, message };
}
