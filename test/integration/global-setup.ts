import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import { assertLocalDb, readStatus } from "./supabase-status";
import { seedUser } from "./seed";

export default async function setup(project: TestProject): Promise<void> {
  const status = readStatus();
  assertLocalDb(status.DB_URL);

  // Deterministic per-run state; missing seed.sql only WARNs (exit 0), seeding here is programmatic.
  execFileSync("npx", ["supabase", "db", "reset"], { stdio: ["ignore", "ignore", "inherit"] });

  const userA = await seedUser(status, "user-a@example.test");
  const userB = await seedUser(status, "user-b@example.test");

  project.provide("apiUrl", status.API_URL);
  project.provide("anonKey", status.ANON_KEY);
  project.provide("serviceRoleKey", status.SERVICE_ROLE_KEY);
  project.provide("userA", userA);
  project.provide("userB", userB);
}
