import { describe, it, expect } from "vitest";
import { createUserClient, seededUserA } from "../fixtures";

// The #1 DB-check (F9): both inserts run as the owner so RLS `with check` passes first and the
// failing constraint is the DB CHECK / UNIQUE. Both are rejected → no successful write, no cleanup.
describe("guest_conflicts canonical-order constraints", () => {
  it("a non-canonical (B,A) insert is rejected by the CHECK (23514)", async () => {
    const a = seededUserA();
    // guest_a_id > guest_b_id violates check (guest_a_id < guest_b_id).
    const res = await createUserClient(a.accessToken).from("guest_conflicts").insert({
      wedding_id: a.weddingId,
      guest_a_id: a.guestHiId,
      guest_b_id: a.guestLoId,
    });
    expect(res.error?.code).toBe("23514");
  });

  it("a duplicate of the seeded canonical pair is rejected by UNIQUE (23505)", async () => {
    const a = seededUserA();
    const res = await createUserClient(a.accessToken).from("guest_conflicts").insert({
      wedding_id: a.weddingId,
      guest_a_id: a.guestLoId,
      guest_b_id: a.guestHiId,
    });
    expect(res.error?.code).toBe("23505");
  });
});
