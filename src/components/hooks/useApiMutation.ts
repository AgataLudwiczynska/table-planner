import { useState } from "react";
import type { ApiResult } from "@/types";

interface MutationRequest {
  url: string;
  method: string;
  body: unknown;
}

interface UseApiMutation<T> {
  pending: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  /** Sends the request; returns the payload on success, or null after setting `error`. */
  run: (request: MutationRequest) => Promise<T | null>;
}

// Shared JSON-mutation pattern: manages pending/error and maps the uniform ApiResult shape.
export function useApiMutation<T>(fallbackMessage: string): UseApiMutation<T> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(request: MutationRequest): Promise<T | null> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = (await res.json()) as ApiResult<T>;
      if (!res.ok || "error" in body) {
        setError("error" in body ? body.error.message : fallbackMessage);
        return null;
      }
      return body.data;
    } catch {
      setError("Nie udało się połączyć z serwerem.");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, setError, run };
}
