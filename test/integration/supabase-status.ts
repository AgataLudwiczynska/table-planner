import { execFileSync } from "node:child_process";

export interface SupabaseStatus {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

// Source connection info only from the local CLI, never from the app's prod env resolution.
export function readStatus(): SupabaseStatus {
  let raw: string;
  try {
    raw = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Local Supabase is not running — run `npx supabase start` first.");
  }
  const status = JSON.parse(raw) as Partial<SupabaseStatus>;
  if (!status.API_URL || !status.DB_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("`supabase status -o json` did not return API_URL/DB_URL/ANON_KEY/SERVICE_ROLE_KEY.");
  }
  return status as SupabaseStatus;
}

// The one guard that stops a mis-targeted `db reset` from wiping a remote database.
export function assertLocalDb(dbUrl: string): void {
  const host = new URL(dbUrl).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run destructive db reset against non-local DB host "${host}".`);
  }
}
