import { describe, it, expect } from "vitest";
import { createAnonClient } from "../fixtures";

const OWNER_SCOPED_TABLES = ["weddings", "tables", "seats", "guests", "guest_conflicts", "assignments"] as const;

// Every table revoked anon grants (SQLSTATE 42501), not merely RLS default-deny —
// a revoked grant is what keeps the table out of the anon schema entirely.
describe("RLS anon denial", () => {
  it("anon SELECT is refused with permission denied on every owner-scoped table", async () => {
    const anon = createAnonClient();

    for (const table of OWNER_SCOPED_TABLES) {
      const res = await anon.from(table).select("id");
      expect(res.error?.code, `anon select on ${table}`).toBe("42501");
    }
  });
});
