import type { SupabaseClient } from "@/lib/supabase";
import type { SeatRow, ServiceResult, Table, TableRow } from "@/types";
import { failure, success } from "./result";

// Embeds each table's seats (ordered); RLS `seats_select` scopes the embed to the owner.
const TABLE_COLUMNS = "id, name, seat_count, seats(id, seat_number)";

type TableRowWithSeats = Pick<TableRow, "id" | "name" | "seat_count"> & {
  seats: Pick<SeatRow, "id" | "seat_number">[];
};

function toTable(row: TableRowWithSeats): Table {
  return {
    id: row.id,
    name: row.name,
    seatCount: row.seat_count,
    seats: row.seats.map((s) => ({ id: s.id, seatNumber: s.seat_number })),
  };
}

export async function listTables(supabase: SupabaseClient, weddingId: string): Promise<ServiceResult<Table[]>> {
  const res = await supabase
    .from("tables")
    .select(TABLE_COLUMNS)
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true })
    .order("seat_number", { ascending: true, referencedTable: "seats" });
  if (res.error) return failure("internal_error");
  return success(res.data.map(toTable));
}

// Delegates to the F-01 RPC (atomic table+seats); maps its raised SQLSTATEs to codes.
export async function createTable(
  supabase: SupabaseClient,
  weddingId: string,
  name: string,
  seatCount: number,
): Promise<ServiceResult<Table>> {
  const res = await supabase.rpc("create_table_with_seats", {
    p_wedding_id: weddingId,
    p_name: name,
    p_seat_count: seatCount,
  });
  if (res.error) {
    if (res.error.code === "42501") return failure("forbidden");
    if (res.error.code === "22023") return failure("invalid_seat_count");
    return failure("internal_error");
  }
  // RPC returns only the new table id; re-read with the embed so the Table carries its seats.
  const created = await supabase.from("tables").select(TABLE_COLUMNS).eq("id", res.data).single();
  if (created.error) return failure("internal_error");
  return success(toTable(created.data));
}

// Delegates to the S-04 RPC (atomic rename+resize); returns the guests freed by a shrink.
export async function updateTable(
  supabase: SupabaseClient,
  tableId: string,
  name: string,
  seatCount: number,
): Promise<ServiceResult<{ table: Table; unassignedGuestIds: string[] }>> {
  const res = await supabase.rpc("update_table", {
    p_table_id: tableId,
    p_name: name,
    p_seat_count: seatCount,
  });
  if (res.error) {
    if (res.error.code === "42501") return failure("forbidden");
    if (res.error.code === "22023") return failure("invalid_seat_count");
    return failure("internal_error");
  }
  const unassignedGuestIds = res.data;
  // Re-read with the embed so the Table carries its new seats (RPC returns only freed ids).
  const updated = await supabase.from("tables").select(TABLE_COLUMNS).eq("id", tableId).single();
  if (updated.error) return failure("internal_error");
  return success({ table: toTable(updated.data), unassignedGuestIds });
}

// Direct DELETE; RLS scopes to the owner and the FK cascade drops the table's seats+assignments.
export async function deleteTable(
  supabase: SupabaseClient,
  tableId: string,
): Promise<ServiceResult<{ tableId: string; unassignedGuestIds: string[] }>> {
  // Capture freed guests BEFORE the delete cascades their assignments away.
  const assigned = await supabase
    .from("assignments")
    .select("guest_id, seats!inner(table_id)")
    .eq("seats.table_id", tableId);
  if (assigned.error) return failure("internal_error");
  const unassignedGuestIds = assigned.data.map((a) => a.guest_id);

  const res = await supabase.from("tables").delete().eq("id", tableId).select("id").maybeSingle();
  if (res.error) return failure("internal_error");
  if (!res.data) return failure("table_not_found");
  return success({ tableId: res.data.id, unassignedGuestIds });
}
