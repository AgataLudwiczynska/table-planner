import { describe, it, expect } from "vitest";
import { createUserClient, seededUserA, seededUserB } from "../fixtures";

// Cross-account writes as B against A's rows (Risk #3): all refused → nothing written, no cleanup.
// Oracle is the owner re-read; a bare update/delete returns error:null even when RLS filters.
describe("RLS cross-account writes — the four RLS-only mutations", () => {
  it("B updating A's guest is a 0-row no-op; the seeded value survives (PATCH guests)", async () => {
    const a = seededUserA();
    const aClient = createUserClient(a.accessToken);
    const bClient = createUserClient(seededUserB().accessToken);

    const before = await aClient.from("guests").select("first_name").eq("id", a.guestLoId).single();
    // Probe differs from the seeded names so "unchanged" proves the write was blocked, not a no-op.
    const attempt = await bClient.from("guests").update({ first_name: "Jan" }).eq("id", a.guestLoId).select();
    const after = await aClient.from("guests").select("first_name").eq("id", a.guestLoId).single();

    expect(attempt.data, "B's update affects 0 rows").toEqual([]);
    expect(after.data?.first_name).toBe(before.data?.first_name);
    expect(after.data?.first_name).not.toBe("Jan");
  });

  it("B deleting A's guest is a 0-row no-op; the row still exists (DELETE guests)", async () => {
    const a = seededUserA();
    const aClient = createUserClient(a.accessToken);
    const attempt = await createUserClient(seededUserB().accessToken)
      .from("guests")
      .delete()
      .eq("id", a.guestLoId)
      .select();
    const after = await aClient.from("guests").select("id").eq("id", a.guestLoId).single();

    expect(attempt.data, "B's delete affects 0 rows").toEqual([]);
    expect(after.data?.id).toBe(a.guestLoId);
  });

  it("B deleting A's conflict is a 0-row no-op; the row still exists (DELETE conflicts)", async () => {
    const a = seededUserA();
    const aClient = createUserClient(a.accessToken);
    const attempt = await createUserClient(seededUserB().accessToken)
      .from("guest_conflicts")
      .delete()
      .eq("id", a.conflictId)
      .select();
    const after = await aClient.from("guest_conflicts").select("id").eq("id", a.conflictId).single();

    expect(attempt.data, "B's delete affects 0 rows").toEqual([]);
    expect(after.data?.id).toBe(a.conflictId);
  });

  it("B deleting A's assignment is a 0-row no-op; the row still exists (DELETE assignments)", async () => {
    const a = seededUserA();
    const aClient = createUserClient(a.accessToken);
    const attempt = await createUserClient(seededUserB().accessToken)
      .from("assignments")
      .delete()
      .eq("id", a.assignmentId)
      .select();
    const after = await aClient.from("assignments").select("id").eq("id", a.assignmentId).single();

    expect(attempt.data, "B's delete affects 0 rows").toEqual([]);
    expect(after.data?.id).toBe(a.assignmentId);
  });
});

describe("RLS cross-account writes — INSERT into A's scope as B raises 42501", () => {
  it("B inserting a wedding owned by A is refused", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("weddings")
      .insert({ user_id: a.userId, name: "Wesele Jana" });
    expect(res.error?.code).toBe("42501");
  });

  it("B inserting a guest into A's wedding is refused", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("guests")
      .insert({ wedding_id: a.weddingId, first_name: "Jan", last_name: "Kowalczyk" });
    expect(res.error?.code).toBe("42501");
  });

  it("B inserting a conflict into A's wedding is refused", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("guest_conflicts")
      .insert({ wedding_id: a.weddingId, guest_a_id: a.guestLoId, guest_b_id: a.guestHiId });
    expect(res.error?.code).toBe("42501");
  });

  it("B inserting an assignment into A's wedding is refused", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("assignments")
      .insert({ wedding_id: a.weddingId, guest_id: a.guestHiId, seat_id: a.seatId });
    expect(res.error?.code).toBe("42501");
  });
});

describe("RLS structural denial — no write policy at all", () => {
  it("a direct INSERT into tables is refused (rows come only from the RPC)", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("tables")
      .insert({ wedding_id: a.weddingId, name: "Stół 2", seat_count: 4 });
    expect(res.error?.code).toBe("42501");
  });

  it("a direct INSERT into seats is refused (rows come only from the RPC)", async () => {
    const a = seededUserA();
    const res = await createUserClient(seededUserB().accessToken)
      .from("seats")
      .insert({ table_id: a.tableId, seat_number: 99 });
    expect(res.error?.code).toBe("42501");
  });

  it("B updating A's conflict is a 0-row no-op — guest_conflicts has no UPDATE policy", async () => {
    const a = seededUserA();
    const aClient = createUserClient(a.accessToken);
    const attempt = await createUserClient(seededUserB().accessToken)
      .from("guest_conflicts")
      .update({ wedding_id: a.weddingId })
      .eq("id", a.conflictId)
      .select();
    const after = await aClient.from("guest_conflicts").select("id").eq("id", a.conflictId).single();

    expect(attempt.data, "update affects 0 rows").toEqual([]);
    expect(after.data?.id).toBe(a.conflictId);
  });
});
