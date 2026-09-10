import { describe, it, expect } from "vitest";
import { createAnonClient, createUserClient, seededUserA, seededUserB } from "../fixtures";

// The RPC is SECURITY DEFINER (bypasses RLS on its inserts), so its own auth.uid() ownership
// check is the only guard against seeding rows into another user's wedding.
describe("RPC create_table_with_seats ownership check", () => {
  it("B calling the RPC with A's wedding_id is refused by the owner self-check (42501)", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken).rpc("create_table_with_seats", {
      p_wedding_id: a.weddingId,
      p_name: "Stół 2",
      p_seat_count: 4,
    });
    expect(res.error?.code).toBe("42501");
  });

  it("anon cannot execute the RPC (execute revoked from anon)", async () => {
    const a = seededUserA();
    const res = await createAnonClient().rpc("create_table_with_seats", {
      p_wedding_id: a.weddingId,
      p_name: "Stół 2",
      p_seat_count: 4,
    });
    expect(res.error?.code).toBe("42501");
  });
});
