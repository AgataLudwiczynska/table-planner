// Single source of truth for app paths referenced in code (redirects, links).
// Astro still routes by filename; this only centralizes references to avoid typos.
export const ROUTES = {
  home: "/",
  wedding: "/wedding",
  signIn: "/auth/signin",
  signUp: "/auth/signup",
  signOut: "/api/auth/signout",
  apiWedding: "/api/wedding",
  apiTables: "/api/tables",
  apiGuests: "/api/guests",
  apiConflicts: "/api/conflicts",
  apiAssignments: "/api/assignments",
} as const;
