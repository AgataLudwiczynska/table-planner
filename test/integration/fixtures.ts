import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/db/database.types";
import type { SeededUser } from "./seed";

type IntegrationClient = ReturnType<typeof createClient<Database>>;

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// --- Low-level builders (explicit connection args) — usable in globalSetup, where inject() is unavailable ---

export function serviceClientFor(apiUrl: string, serviceRoleKey: string): IntegrationClient {
  return createClient<Database>(apiUrl, serviceRoleKey, CLIENT_OPTS);
}

export function anonClientFor(apiUrl: string, anonKey: string): IntegrationClient {
  return createClient<Database>(apiUrl, anonKey, CLIENT_OPTS);
}

// A real user JWT in the Authorization header runs queries under that user's authenticated role.
export function userClientFor(apiUrl: string, anonKey: string, accessToken: string): IntegrationClient {
  return createClient<Database>(apiUrl, anonKey, {
    ...CLIENT_OPTS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// --- inject()-backed wrappers — what specs use (connection comes from globalSetup's provide) ---

export const createServiceClient = (): IntegrationClient =>
  serviceClientFor(inject("apiUrl"), inject("serviceRoleKey"));
export const createUserClient = (accessToken: string): IntegrationClient =>
  userClientFor(inject("apiUrl"), inject("anonKey"), accessToken);

export const seededUserA = (): SeededUser => inject("userA");
export const seededUserB = (): SeededUser => inject("userB");

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    anonKey: string;
    serviceRoleKey: string;
    userA: SeededUser;
    userB: SeededUser;
  }
}
