import type { SupabaseClient } from "@/lib/supabase";
import type { Conflict, GuestConflictRow, ServiceResult } from "@/types";
import { failure, success } from "./result";

type ConflictRowSubset = Pick<GuestConflictRow, "id" | "guest_a_id" | "guest_b_id">;
const CONFLICT_COLUMNS = "id, guest_a_id, guest_b_id";

function toConflict(row: ConflictRowSubset): Conflict {
  return { id: row.id, guestAId: row.guest_a_id, guestBId: row.guest_b_id };
}

export async function listConflicts(supabase: SupabaseClient, weddingId: string): Promise<ServiceResult<Conflict[]>> {
  const res = await supabase
    .from("guest_conflicts")
    .select(CONFLICT_COLUMNS)
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
  if (res.error) return failure("internal_error");
  return success(res.data.map(toConflict));
}

export async function createConflict(
  supabase: SupabaseClient,
  weddingId: string,
  guestAId: string,
  guestBId: string,
): Promise<ServiceResult<Conflict>> {
  if (guestAId === guestBId) return failure("conflict_self");

  // Canonical order: smaller id first (UUIDs compare lexicographically), matching the DB check.
  const [lo, hi] = guestAId < guestBId ? [guestAId, guestBId] : [guestBId, guestAId];

  // Both ids must belong to this wedding (RLS already scopes the query to the owner).
  const guestsRes = await supabase.from("guests").select("id").eq("wedding_id", weddingId).in("id", [lo, hi]);
  if (guestsRes.error) return failure("internal_error");
  if (guestsRes.data.length !== 2) return failure("invalid_guest");

  const existingRes = await supabase
    .from("guest_conflicts")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("guest_a_id", lo)
    .eq("guest_b_id", hi)
    .maybeSingle();
  if (existingRes.error) return failure("internal_error");
  if (existingRes.data) return failure("conflict_exists");

  const res = await supabase
    .from("guest_conflicts")
    .insert({ wedding_id: weddingId, guest_a_id: lo, guest_b_id: hi })
    .select(CONFLICT_COLUMNS)
    .single();
  if (res.error) {
    if (res.error.code === "23505") return failure("conflict_exists");
    return failure("internal_error");
  }
  return success(toConflict(res.data));
}

export async function deleteConflict(
  supabase: SupabaseClient,
  conflictId: string,
): Promise<ServiceResult<{ id: string }>> {
  const res = await supabase.from("guest_conflicts").delete().eq("id", conflictId).select("id").maybeSingle();
  if (res.error) return failure("internal_error");
  if (!res.data) return failure("conflict_not_found");
  return success({ id: res.data.id });
}
