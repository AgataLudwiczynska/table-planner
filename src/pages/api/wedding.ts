import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { apiError, apiErrorFrom, apiFailure, apiSuccess } from "@/lib/api";
import { getWedding, renameWedding } from "@/lib/services/wedding.service";

export const prerender = false;

const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nazwa wesela nie może być pusta.")
    .max(100, "Nazwa wesela jest za długa (maks. 100 znaków)."),
});

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

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0].message, 400);
  }

  // Resolve the wedding server-side (read-only, never provisions); the /wedding page already created it.
  const found = await getWedding(supabase, user.id);
  if (!found.ok) return apiFailure(found);
  if (!found.data) return apiErrorFrom("wedding_not_found");

  const renamed = await renameWedding(supabase, found.data.id, parsed.data.name);
  if (!renamed.ok) return apiFailure(renamed);

  return apiSuccess(renamed.data);
};
