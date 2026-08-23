import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { apiError, apiErrorFrom, apiFailure, apiSuccess } from "@/lib/api";
import { getWedding } from "@/lib/services/wedding.service";
import { assignSeat, unassign } from "@/lib/services/assignment.service";

export const prerender = false;

const assignSchema = z.object({
  guestId: z.uuid("Nieprawidłowy identyfikator gościa."),
  seatId: z.uuid("Nieprawidłowy identyfikator miejsca."),
});

const unassignSchema = z.object({
  guestId: z.uuid("Nieprawidłowy identyfikator gościa."),
});

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return apiErrorFrom("supabase_unconfigured");

  const user = context.locals.user;
  if (!user) return apiErrorFrom("unauthorized");

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return apiError("validation_error", "Nieprawidłowe dane.", 400);
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const found = await getWedding(supabase, user.id);
  if (!found.ok) return apiFailure(found);
  if (!found.data) return apiErrorFrom("wedding_not_found");

  const assigned = await assignSeat(supabase, found.data.id, parsed.data.guestId, parsed.data.seatId);
  if (!assigned.ok) return apiFailure(assigned);

  // 200 (not 201): assign and move are both upserts — a move is an UPDATE, not a create.
  return apiSuccess(assigned.data);
};

export const DELETE: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return apiErrorFrom("supabase_unconfigured");

  const user = context.locals.user;
  if (!user) return apiErrorFrom("unauthorized");

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return apiError("validation_error", "Nieprawidłowe dane.", 400);
  }

  const parsed = unassignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const deleted = await unassign(supabase, parsed.data.guestId);
  if (!deleted.ok) return apiFailure(deleted);

  return apiSuccess(deleted.data);
};
