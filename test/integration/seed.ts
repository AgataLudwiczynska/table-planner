import type { SupabaseStatus } from "./supabase-status";
import { anonClientFor, serviceClientFor, userClientFor } from "./fixtures";

// One seeded owner + their full data graph. Specs target these ids as owner or attacker.
export interface SeededUser {
  email: string;
  password: string;
  userId: string;
  accessToken: string;
  weddingId: string;
  tableId: string;
  seatId: string;
  // Canonical guest pair (guestLoId < guestHiId) — matches the guest_conflicts CHECK.
  guestLoId: string;
  guestHiId: string;
  conflictId: string;
  assignmentId: string;
}

const PASSWORD = "password123";

export async function seedUser(status: SupabaseStatus, email: string): Promise<SeededUser> {
  const service = serviceClientFor(status.API_URL, status.SERVICE_ROLE_KEY);

  // enable_confirmations=false makes the seeded user sign-in-ready with no email step.
  const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(`seed: createUser failed for ${email}`);
  const userId = created.data.user.id;

  const signIn = await anonClientFor(status.API_URL, status.ANON_KEY).auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signIn.error) throw new Error(`seed: signIn failed for ${email}`);
  const accessToken = signIn.data.session.access_token;

  // Real owner JWT so the SECURITY DEFINER RPC's auth.uid() ownership check passes.
  const owner = userClientFor(status.API_URL, status.ANON_KEY, accessToken);

  const wedding = await service
    .from("weddings")
    .insert({ user_id: userId, name: "Nasze wesele" })
    .select("id")
    .single();
  if (wedding.error) throw new Error(`seed: wedding insert failed for ${email}: ${wedding.error.message}`);
  const weddingId = wedding.data.id;

  const table = await owner.rpc("create_table_with_seats", {
    p_wedding_id: weddingId,
    p_name: "Stół 1",
    p_seat_count: 4,
  });
  if (table.error || !table.data) throw new Error(`seed: create_table_with_seats failed for ${email}`);
  const tableId = table.data;

  const seat = await service.from("seats").select("id").eq("table_id", tableId).order("seat_number").limit(1).single();
  if (seat.error) throw new Error(`seed: seat lookup failed for ${email}: ${seat.error.message}`);

  const guests = await service
    .from("guests")
    .insert([
      { wedding_id: weddingId, first_name: "Anna", last_name: "Nowak" },
      { wedding_id: weddingId, first_name: "Piotr", last_name: "Kowalski" },
    ])
    .select("id");
  if (guests.error || guests.data.length < 2) throw new Error(`seed: guests insert failed for ${email}`);
  // Text sort of lowercase-hex UUIDs matches Postgres uuid `<`, so this is the canonical pair order.
  const [guestLoId, guestHiId] = guests.data.map((g) => g.id).sort();

  const conflict = await service
    .from("guest_conflicts")
    .insert({ wedding_id: weddingId, guest_a_id: guestLoId, guest_b_id: guestHiId })
    .select("id")
    .single();
  if (conflict.error) throw new Error(`seed: conflict insert failed for ${email}: ${conflict.error.message}`);

  const assignment = await service
    .from("assignments")
    .insert({ wedding_id: weddingId, guest_id: guestLoId, seat_id: seat.data.id })
    .select("id")
    .single();
  if (assignment.error) throw new Error(`seed: assignment insert failed for ${email}: ${assignment.error.message}`);

  return {
    email,
    password: PASSWORD,
    userId,
    accessToken,
    weddingId,
    tableId,
    seatId: seat.data.id,
    guestLoId,
    guestHiId,
    conflictId: conflict.data.id,
    assignmentId: assignment.data.id,
  };
}
