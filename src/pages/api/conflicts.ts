import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { apiError, apiErrorFrom, apiFailure, apiSuccess } from "@/lib/api";
import { getWedding } from "@/lib/services/wedding.service";
import { createConflict, deleteConflict } from "@/lib/services/conflict.service";

export const prerender = false;

const createConflictSchema = z.object({
  guestAId: z.uuid("Nieprawidłowy identyfikator gościa."),
  guestBId: z.uuid("Nieprawidłowy identyfikator gościa."),
});

const deleteConflictSchema = z.object({
  id: z.uuid("Nieprawidłowy identyfikator konfliktu."),
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

  const parsed = createConflictSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const found = await getWedding(supabase, user.id);
  if (!found.ok) return apiFailure(found);
  if (!found.data) return apiErrorFrom("wedding_not_found");

  const created = await createConflict(supabase, found.data.id, parsed.data.guestAId, parsed.data.guestBId);
  if (!created.ok) return apiFailure(created);

  return apiSuccess(created.data, 201);
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

  const parsed = deleteConflictSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const deleted = await deleteConflict(supabase, parsed.data.id);
  if (!deleted.ok) return apiFailure(deleted);

  return apiSuccess(deleted.data);
};
