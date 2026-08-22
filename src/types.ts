import type { Database } from "@/db/database.types";

// --- DB row aliases (snake_case, straight from the generated schema types) ---

export type WeddingRow = Database["public"]["Tables"]["weddings"]["Row"];
export type TableRow = Database["public"]["Tables"]["tables"]["Row"];
export type SeatRow = Database["public"]["Tables"]["seats"]["Row"];
export type GuestRow = Database["public"]["Tables"]["guests"]["Row"];
export type GuestConflictRow = Database["public"]["Tables"]["guest_conflicts"]["Row"];
export type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];

// --- Domain shapes (camelCase; what the API returns and app code passes around) ---
// The service maps a snake_case Row (e.g. `seat_count`) to these (e.g. `seatCount`).

/** A wedding as exposed by the API. */
export interface Wedding {
  id: string;
  name: string;
}

/** One seat of a table; key assignments off `id`, never `seatNumber` (unique only within a table). */
export interface Seat {
  id: string;
  seatNumber: number;
}

/** A round table as exposed by the API, carrying its ordered seats for the ring. */
export interface Table {
  id: string;
  name: string;
  seatCount: number;
  seats: Seat[];
}

/** A guest→seat assignment as exposed by the API. */
export interface Assignment {
  id: string;
  guestId: string;
  seatId: string;
}

/** Which side of the wedding a guest belongs to (optional). */
export type GuestSide = "panna_mloda" | "pan_mlody" | "wspolne" | "nieokreslone";

/** A guest's relationship group (optional). */
export type GuestGroup = "rodzina" | "przyjaciele" | "wspolpracownicy";

/** A guest as exposed by the API. Maps the `guest_group` column to `group`. */
export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  side: GuestSide | null;
  group: GuestGroup | null;
}

/** A binary "not next to each other" conflict pair, id-only (names joined in the UI). */
export interface Conflict {
  id: string;
  guestAId: string;
  guestBId: string;
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

/** Body of `POST /api/guests` (wedding is resolved server-side). Empty side/group is `null`, never omitted. */
export interface CreateGuestInput {
  firstName: string;
  lastName: string;
  side: GuestSide | null;
  group: GuestGroup | null;
}

/** Body of `PATCH /api/guests` (same shape as create; target `id` carried separately). */
export type UpdateGuestInput = CreateGuestInput;

/** Body of `POST /api/conflicts` (wedding is resolved server-side). */
export interface CreateConflictInput {
  guestAId: string;
  guestBId: string;
}

/** Body of `POST /api/assignments` (wedding is resolved server-side). Assign or move a guest to a seat. */
export interface AssignSeatInput {
  guestId: string;
  seatId: string;
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
