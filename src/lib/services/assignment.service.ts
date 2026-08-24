import type { SupabaseClient } from "@/lib/supabase";
import type { Assignment, AssignmentRow, ServiceResult } from "@/types";
import { failure, success } from "./result";

type AssignmentRowSubset = Pick<AssignmentRow, "id" | "guest_id" | "seat_id">;
const ASSIGNMENT_COLUMNS = "id, guest_id, seat_id";

function toAssignment(row: AssignmentRowSubset): Assignment {
  return { id: row.id, guestId: row.guest_id, seatId: row.seat_id };
}

export async function listAssignments(
  supabase: SupabaseClient,
  weddingId: string,
): Promise<ServiceResult<Assignment[]>> {
  const res = await supabase
    .from("assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
  if (res.error) return failure("internal_error");
  return success(res.data.map(toAssignment));
}

// upsert(onConflict: guest_id) makes move atomic: a re-seat UPDATEs in place, while
// a different guest hitting an occupied seat trips unique(seat_id) → seat_occupied.
export async function assignSeat(
  supabase: SupabaseClient,
  weddingId: string,
  guestId: string,
  seatId: string,
): Promise<ServiceResult<Assignment>> {
  // Both the guest and the seat must belong to this wedding (RLS is a backstop, not the primary check).
  const guestRes = await supabase
    .from("guests")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("id", guestId)
    .maybeSingle();
  if (guestRes.error) return failure("internal_error");
  if (!guestRes.data) return failure("invalid_guest");

  // `seats` has no wedding_id, so the ownership filter lives on the embedded parent table.
  const seatRes = await supabase
    .from("seats")
    .select("id, tables!inner(wedding_id)")
    .eq("id", seatId)
    .eq("tables.wedding_id", weddingId)
    .maybeSingle();
  if (seatRes.error) return failure("internal_error");
  if (!seatRes.data) return failure("seat_not_found");

  const res = await supabase
    .from("assignments")
    .upsert({ wedding_id: weddingId, guest_id: guestId, seat_id: seatId }, { onConflict: "guest_id" })
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (res.error) {
    if (res.error.code === "23505") return failure("seat_occupied");
    if (res.error.code === "42501") return failure("forbidden");
    return failure("internal_error");
  }
  return success(toAssignment(res.data));
}

export async function unassign(supabase: SupabaseClient, guestId: string): Promise<ServiceResult<{ guestId: string }>> {
  const res = await supabase.from("assignments").delete().eq("guest_id", guestId).select("guest_id").maybeSingle();
  if (res.error) return failure("internal_error");
  if (!res.data) return failure("assignment_not_found");
  return success({ guestId: res.data.guest_id });
}
