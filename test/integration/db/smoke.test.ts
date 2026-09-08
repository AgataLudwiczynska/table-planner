import { describe, it, expect } from "vitest";
import { createServiceClient, createUserClient, seededUserA, seededUserB } from "../fixtures";

// Proves the harness before the matrix: two JWT sessions resolve distinct auth.uid(),
// each sees only its own seeded wedding, and the service-role client reads across both.
describe("integration harness smoke", () => {
  it("each user's JWT resolves to its own auth.uid()", async () => {
    const a = seededUserA();
    const b = seededUserB();

    const resA = await createUserClient(a.accessToken).auth.getUser();
    const resB = await createUserClient(b.accessToken).auth.getUser();

    expect(resA.data.user?.id).toBe(a.userId);
    expect(resB.data.user?.id).toBe(b.userId);
    expect(a.userId).not.toBe(b.userId);
  });

  it("user A sees only its own wedding, user B only its own", async () => {
    const a = seededUserA();
    const b = seededUserB();

    const rowsA = await createUserClient(a.accessToken).from("weddings").select("id");
    const rowsB = await createUserClient(b.accessToken).from("weddings").select("id");

    expect(rowsA.error).toBeNull();
    expect(rowsB.error).toBeNull();
    expect((rowsA.data ?? []).map((w) => w.id)).toEqual([a.weddingId]);
    expect((rowsB.data ?? []).map((w) => w.id)).toEqual([b.weddingId]);
  });

  // The one place a service-role read is asserted: a harness self-check, never an RLS/IDOR oracle.
  it("the service-role client reads across both weddings", async () => {
    const a = seededUserA();
    const b = seededUserB();

    const res = await createServiceClient().from("weddings").select("id");
    const ids = (res.data ?? []).map((w) => w.id);

    expect(res.error).toBeNull();
    expect(ids).toContain(a.weddingId);
    expect(ids).toContain(b.weddingId);
  });
});
