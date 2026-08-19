import type { SupabaseClient } from "@/lib/supabase";
import type {
  CreateGuestInput,
  Guest,
  GuestGroup,
  GuestRow,
  GuestSide,
  ServiceResult,
  UpdateGuestInput,
} from "@/types";
import { failure, success } from "./result";

type GuestRowSubset = Pick<GuestRow, "id" | "first_name" | "last_name" | "side" | "guest_group">;
const GUEST_COLUMNS = "id, first_name, last_name, side, guest_group";

function toGuest(row: GuestRowSubset): Guest {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    side: row.side as GuestSide | null,
    group: row.guest_group as GuestGroup | null,
  };
}

export async function listGuests(supabase: SupabaseClient, weddingId: string): Promise<ServiceResult<Guest[]>> {
  const res = await supabase
    .from("guests")
    .select(GUEST_COLUMNS)
    .eq("wedding_id", weddingId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (res.error) return failure("internal_error");
  return success(res.data.map(toGuest));
}

export async function createGuest(
  supabase: SupabaseClient,
  weddingId: string,
  input: CreateGuestInput,
): Promise<ServiceResult<Guest>> {
  const res = await supabase
    .from("guests")
    .insert({
      wedding_id: weddingId,
      first_name: input.firstName,
      last_name: input.lastName,
      side: input.side,
      guest_group: input.group,
    })
    .select(GUEST_COLUMNS)
    .single();
  if (res.error) {
    if (res.error.code === "23505") return failure("guest_name_exists");
    return failure("internal_error");
  }
  return success(toGuest(res.data));
}

export async function updateGuest(
  supabase: SupabaseClient,
  guestId: string,
  input: UpdateGuestInput,
): Promise<ServiceResult<Guest>> {
  const res = await supabase
    .from("guests")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      side: input.side,
      guest_group: input.group,
    })
    .eq("id", guestId)
    .select(GUEST_COLUMNS)
    .maybeSingle();
  if (res.error) {
    if (res.error.code === "23505") return failure("guest_name_exists");
    return failure("internal_error");
  }
  if (!res.data) return failure("guest_not_found");
  return success(toGuest(res.data));
}

export async function deleteGuest(supabase: SupabaseClient, guestId: string): Promise<ServiceResult<{ id: string }>> {
  const res = await supabase.from("guests").delete().eq("id", guestId).select("id").maybeSingle();
  if (res.error) return failure("internal_error");
  if (!res.data) return failure("guest_not_found");
  return success({ id: res.data.id });
}
