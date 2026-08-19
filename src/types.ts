import type { Database } from "@/db/database.types";

// --- DB row aliases (snake_case, straight from the generated schema types) ---

export type WeddingRow = Database["public"]["Tables"]["weddings"]["Row"];
export type TableRow = Database["public"]["Tables"]["tables"]["Row"];
export type SeatRow = Database["public"]["Tables"]["seats"]["Row"];

// --- Domain shapes (camelCase; what the API returns and app code passes around) ---
// The service maps a snake_case Row (e.g. `seat_count`) to these (e.g. `seatCount`).

/** A wedding as exposed by the API. */
export interface Wedding {
  id: string;
  name: string;
}

/** A round table as exposed by the API. */
export interface Table {
  id: string;
  name: string;
  seatCount: number;
}

// --- Command inputs (request bodies the API accepts) ---

/** Body of `PATCH /api/wedding`. */
export interface RenameWeddingInput {
  name: string;
}

/** Body of `POST /api/tables` (wedding is resolved server-side, never client-supplied). */
export interface CreateTableInput {
  name: string;
  seatCount: number;
}

// --- Uniform API result envelope (every domain endpoint emits this shape) ---

/** The error body every domain endpoint returns on failure. */
export interface ApiError {
  error: { code: string; message: string };
}

/** Discriminated result: a success payload or the uniform error body. */
export type ApiResult<T> = { data: T } | ApiError;

// --- Service-layer result (services return values, never throw for expected failures) ---

/** The failure channel of a service result: maps straight onto the API error shape. */
export interface ServiceFailure {
  code: string;
  status: number;
  message: string;
}

/** A service call's outcome: a success payload, or a failure carrying its API mapping. */
export type ServiceResult<T> = { ok: true; data: T } | ({ ok: false } & ServiceFailure);
