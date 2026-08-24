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
