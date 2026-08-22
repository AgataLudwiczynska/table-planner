import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { apiError, apiErrorFrom, apiFailure, apiSuccess } from "@/lib/api";
import { getWedding } from "@/lib/services/wedding.service";
import { createGuest, deleteGuest, updateGuest } from "@/lib/services/guest.service";

export const prerender = false;

const GUEST_SIDES = ["panna_mloda", "pan_mlody", "wspolne", "nieokreslone"] as const;
const GUEST_GROUPS = ["rodzina", "przyjaciele", "wspolpracownicy"] as const;

// Empty side/group arrive as null (never omitted) so update never silently skips the column.
const guestFieldsSchema = z.object({
  firstName: z.string().trim().min(1, "Imię nie może być puste.").max(100, "Imię jest za długie (maks. 100 znaków)."),
  lastName: z
    .string()
    .trim()
    .min(1, "Nazwisko nie może być puste.")
    .max(100, "Nazwisko jest za długie (maks. 100 znaków)."),
  side: z.enum(GUEST_SIDES).nullish(),
  group: z.enum(GUEST_GROUPS).nullish(),
});

const updateGuestSchema = guestFieldsSchema.extend({
  id: z.uuid("Nieprawidłowy identyfikator gościa."),
});

const deleteGuestSchema = z.object({
  id: z.uuid("Nieprawidłowy identyfikator gościa."),
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

  const parsed = guestFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const found = await getWedding(supabase, user.id);
  if (!found.ok) return apiFailure(found);
  if (!found.data) return apiErrorFrom("wedding_not_found");

  const created = await createGuest(supabase, found.data.id, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    side: parsed.data.side ?? null,
    group: parsed.data.group ?? null,
  });
  if (!created.ok) return apiFailure(created);

  return apiSuccess(created.data, 201);
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = updateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const updated = await updateGuest(supabase, parsed.data.id, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    side: parsed.data.side ?? null,
    group: parsed.data.group ?? null,
  });
  if (!updated.ok) return apiFailure(updated);

  return apiSuccess(updated.data);
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

  const parsed = deleteGuestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  const deleted = await deleteGuest(supabase, parsed.data.id);
  if (!deleted.ok) return apiFailure(deleted);

  return apiSuccess(deleted.data);
};
