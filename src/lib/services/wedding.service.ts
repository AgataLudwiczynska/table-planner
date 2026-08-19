import type { SupabaseClient } from "@/lib/supabase";
import type { ServiceResult, Wedding, WeddingRow } from "@/types";
import { failure, success } from "./result";

const DEFAULT_WEDDING_NAME = "Nasze wesele";

function toWedding(row: Pick<WeddingRow, "id" | "name">): Wedding {
  return { id: row.id, name: row.name };
}

// Auto-provision the user's wedding — called only by the /wedding page load.
export async function getOrCreateWedding(supabase: SupabaseClient, userId: string): Promise<ServiceResult<Wedding>> {
  const existing = await supabase
    .from("weddings")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) return failure("internal_error");
  if (existing.data) return success(toWedding(existing.data));

  const created = await supabase
    .from("weddings")
    .insert({ user_id: userId, name: DEFAULT_WEDDING_NAME })
    .select("id, name")
    .single();
  if (created.error) return failure("internal_error");
  return success(toWedding(created.data));
}

// Read-only lookup for mutation endpoints so a write never provisions. null = user has none.
export async function getWedding(supabase: SupabaseClient, userId: string): Promise<ServiceResult<Wedding | null>> {
  const res = await supabase
    .from("weddings")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (res.error) return failure("internal_error");
  return success(res.data ? toWedding(res.data) : null);
}

// Empty update is ambiguous (missing/RLS/anomaly) → generic 500, not a guessed 404/403.
export async function renameWedding(
  supabase: SupabaseClient,
  weddingId: string,
  name: string,
): Promise<ServiceResult<Wedding>> {
  const res = await supabase.from("weddings").update({ name }).eq("id", weddingId).select("id, name").maybeSingle();
  if (res.error || !res.data) return failure("internal_error");
  return success(toWedding(res.data));
}
