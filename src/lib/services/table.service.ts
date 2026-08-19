import type { SupabaseClient } from "@/lib/supabase";
import type { ServiceResult, Table, TableRow } from "@/types";
import { failure, success } from "./result";

function toTable(row: Pick<TableRow, "id" | "name" | "seat_count">): Table {
  return { id: row.id, name: row.name, seatCount: row.seat_count };
}

export async function listTables(supabase: SupabaseClient, weddingId: string): Promise<ServiceResult<Table[]>> {
  const res = await supabase
    .from("tables")
    .select("id, name, seat_count")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
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
  // RPC returns the new table id only; build the DTO from validated inputs.
  return success({ id: res.data, name, seatCount });
}
