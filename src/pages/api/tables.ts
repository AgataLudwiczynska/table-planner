import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { apiError, apiErrorFrom, apiFailure, apiSuccess } from "@/lib/api";
import { getWedding } from "@/lib/services/wedding.service";
import { createTable, deleteTable, updateTable } from "@/lib/services/table.service";

export const prerender = false;

// seatCount ceiling (30) closes F-01 follow-up F1 at the API layer.
const createTableSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nazwa stołu nie może być pusta.")
    .max(50, "Nazwa stołu jest za długa (maks. 50 znaków)."),
  seatCount: z
    .number({ error: "Liczba miejsc musi być liczbą." })
    .int("Liczba miejsc musi być liczbą całkowitą.")
    .min(1, "Liczba miejsc musi być co najmniej 1.")
    .max(30, "Liczba miejsc nie może przekraczać 30."),
});

const updateTableSchema = createTableSchema.extend({
  tableId: z.uuid("Nieprawidłowy identyfikator stołu."),
});

const deleteTableSchema = z.object({
  tableId: z.uuid("Nieprawidłowy identyfikator stołu."),
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

  const parsed = createTableSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue.path[0] === "seatCount" ? "invalid_seat_count" : "validation_error";
    return apiError(code, issue.message, 400);
  }

  // Resolve the wedding server-side (read-only, never trusts a client-supplied id, never provisions).
  const found = await getWedding(supabase, user.id);
  if (!found.ok) return apiFailure(found);
  if (!found.data) return apiErrorFrom("wedding_not_found");

  const created = await createTable(supabase, found.data.id, parsed.data.name, parsed.data.seatCount);
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

  const parsed = updateTableSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue.path[0] === "seatCount" ? "invalid_seat_count" : "validation_error";
    return apiError(code, issue.message, 400);
  }

  // Ownership is enforced by the RPC guard; the client-supplied tableId is never trusted beyond validation.
  const updated = await updateTable(supabase, parsed.data.tableId, parsed.data.name, parsed.data.seatCount);
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

  const parsed = deleteTableSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  // Ownership is enforced by RLS; the client-supplied tableId is never trusted beyond validation.
  const deleted = await deleteTable(supabase, parsed.data.tableId);
  if (!deleted.ok) return apiFailure(deleted);

  return apiSuccess(deleted.data);
};
