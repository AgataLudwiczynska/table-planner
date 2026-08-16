import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";

const PROTECTED_ROUTES = [ROUTES.wedding];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  // Authenticated users skip the public landing and go straight to the workspace.
  if (context.locals.user && context.url.pathname === ROUTES.home) {
    return context.redirect(ROUTES.wedding);
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect(ROUTES.signIn);
    }
  }

  return next();
});
