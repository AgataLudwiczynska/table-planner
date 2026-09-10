import { describe, it, expect } from "vitest";
import { createUserClient, seededUserA, seededUserB } from "../fixtures";

// Cross-account SELECT isolation (Risk #3): the same .eq('id', A's id) returns 1 row as A,
// 0 as B — proving RLS filtered B out, not an empty table. Assert on count, never messages.
describe("RLS cross-account SELECT isolation", () => {
  const ownerScopedTables = () => {
    const a = seededUserA();
    return [
      { table: "weddings", id: a.weddingId },
      { table: "tables", id: a.tableId },
      { table: "seats", id: a.seatId },
      { table: "guests", id: a.guestLoId },
      { table: "guest_conflicts", id: a.conflictId },
      { table: "assignments", id: a.assignmentId },
    ] as const;
  };

  it("user A sees its own seeded row in every table while user B sees 0", async () => {
    const aClient = createUserClient(seededUserA().accessToken);
    const bClient = createUserClient(seededUserB().accessToken);

    for (const { table, id } of ownerScopedTables()) {
      const asOwner = await aClient.from(table).select("id").eq("id", id);
      const asAttacker = await bClient.from(table).select("id").eq("id", id);

      expect(asOwner.error, `owner select on ${table}`).toBeNull();
      expect(asAttacker.error, `attacker select on ${table}`).toBeNull();
      expect(
        asOwner.data?.map((r) => r.id),
        `owner sees own row in ${table}`,
      ).toEqual([id]);
      expect(asAttacker.data, `attacker sees 0 rows in ${table}`).toEqual([]);
    }
  });
});
