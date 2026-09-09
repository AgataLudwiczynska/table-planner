// HTTP seam for the Phase 3 contract tests: real fetch against `npm run preview` (workerd) with a
// cookie jar. Prereq: preview built+running, .dev.vars pointing at the local Supabase globalSetup seeds.

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL ?? "http://localhost:4321";

const READINESS_HINT =
  "run `npm run build && npm run preview` first (a stale build silently tests old code), " +
  "and point preview's .dev.vars SUPABASE_URL/SUPABASE_KEY at the local Supabase (127.0.0.1:54321) globalSetup seeds";

// Fail fast with actionable guidance instead of every spec timing out.
export async function assertPreviewReachable(): Promise<void> {
  try {
    await fetch(PREVIEW_BASE_URL, { redirect: "manual" });
  } catch {
    throw new Error(`Preview server not reachable at ${PREVIEW_BASE_URL} — ${READINESS_HINT}.`);
  }
}

export type CookieJar = Map<string, string>;

function mergeSetCookies(jar: CookieJar, res: Response): void {
  for (const setCookie of res.headers.getSetCookie()) {
    const pair = setCookie.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    // Empty value = a cleared/expired cookie; drop it.
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

// Sign in through the real form endpoint; a failure redirects back to /auth/signin with no cookie set.
export async function signIn(email: string, password: string): Promise<CookieJar> {
  const jar: CookieJar = new Map();
  // Astro's default CSRF check 403s a form POST whose Origin doesn't match the host; a server-side
  // fetch sends none, so set it explicitly to the preview origin.
  const res = await fetch(`${PREVIEW_BASE_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: PREVIEW_BASE_URL },
    body: new URLSearchParams({ email, password }).toString(),
    redirect: "manual",
  });
  mergeSetCookies(jar, res);

  const location = res.headers.get("location") ?? "";
  if (jar.size === 0 || location.includes("/auth/signin")) {
    throw new Error(`signIn failed for ${email} (status=${res.status}, redirect="${location}") — ${READINESS_HINT}.`);
  }
  return jar;
}

// Authed request; also folds any refreshed Set-Cookie back into the jar.
export async function authedFetch(jar: CookieJar, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookieHeader(jar));
  const res = await fetch(`${PREVIEW_BASE_URL}${path}`, { ...init, headers, redirect: "manual" });
  mergeSetCookies(jar, res);
  return res;
}

// JSON init; pass a string as `body` to send an intentionally unparseable payload.
export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

export interface ParsedResponse {
  status: number;
  raw: string;
  json: unknown;
}

// One read: raw text for the no-PII scan, parsed JSON for code checks.
export async function readResponse(res: Response): Promise<ParsedResponse> {
  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  return { status: res.status, raw, json };
}

// The { error: { code } } code, or undefined if the shape differs.
export function errorCode(json: unknown): string | undefined {
  if (typeof json === "object" && json !== null && "error" in json) {
    const err = json.error;
    if (typeof err === "object" && err !== null && "code" in err) {
      const code = err.code;
      return typeof code === "string" ? code : undefined;
    }
  }
  return undefined;
}
