import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";
import { createServiceClient, seededUserA, seededUserB } from "../fixtures";
import type { SeededUser } from "../seed";
import {
  assertPreviewReachable,
  authedFetch,
  errorCode,
  jsonInit,
  readResponse,
  signIn,
  type CookieJar,
} from "./http-client";

// Risk #3 over HTTP: as user B, RLS-only mutations against A's rows take the not-found path (404);
// a client-supplied wedding_id is ignored; an IDOR-via-payload POST is refused with nothing written.
describe("IDOR over HTTP + wedding_id ignored", () => {
  let jar: CookieJar;
  let a: SeededUser;
  let b: SeededUser;
  const throwawayGuestIds: string[] = [];

  beforeAll(async () => {
    a = seededUserA();
    b = seededUserB();
    await assertPreviewReachable();
    jar = await signIn(b.email, b.password);
  });

  afterAll(async () => {
    // Only the wedding_id-ignored cell writes a real row; delete it so the shared seed graph is untouched.
    if (throwawayGuestIds.length === 0) return;
    await createServiceClient().from("guests").delete().in("id", throwawayGuestIds);
  });

  it("PATCH /api/guests on A's guest as B → 404 guest_not_found", async () => {
    const res = await authedFetch(
      jar,
      ROUTES.apiGuests,
      jsonInit("PATCH", { id: a.guestLoId, firstName: "Jan", lastName: "Kowalski" }),
    );
    const { status, json } = await readResponse(res);
    expect(status).toBe(404);
    expect(errorCode(json)).toBe("guest_not_found");
  });

  it("DELETE /api/guests on A's guest as B → 404 guest_not_found", async () => {
    const res = await authedFetch(jar, ROUTES.apiGuests, jsonInit("DELETE", { id: a.guestLoId }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(404);
    expect(errorCode(json)).toBe("guest_not_found");
  });

  it("DELETE /api/conflicts on A's conflict as B → 404 conflict_not_found", async () => {
    const res = await authedFetch(jar, ROUTES.apiConflicts, jsonInit("DELETE", { id: a.conflictId }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(404);
    expect(errorCode(json)).toBe("conflict_not_found");
  });

  it("DELETE /api/assignments on A's guest as B → 404 assignment_not_found", async () => {
    const res = await authedFetch(jar, ROUTES.apiAssignments, jsonInit("DELETE", { guestId: a.guestLoId }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(404);
    expect(errorCode(json)).toBe("assignment_not_found");
  });

  // Mass-assignment defense: an extra wedding_id in the body is stripped; the row scopes to B's wedding.
  it("POST /api/guests with a foreign wedding_id → row scoped to B, not the supplied wedding", async () => {
    const res = await authedFetch(
      jar,
      ROUTES.apiGuests,
      jsonInit("POST", { firstName: "Anna", lastName: "Wiśniewska", wedding_id: a.weddingId }),
    );
    const { status, json } = await readResponse(res);
    expect(status).toBe(201);

    const createdId = (json as { data: { id: string } }).data.id;
    throwawayGuestIds.push(createdId);

    const row = await createServiceClient().from("guests").select("wedding_id").eq("id", createdId).single();
    expect(row.error).toBeNull();
    expect(row.data?.wedding_id).toBe(b.weddingId);
    expect(row.data?.wedding_id).not.toBe(a.weddingId);
  });

  // IDOR-via-payload: A's seat referenced by B is refused (4xx, code not pinned) and nothing is written.
  it("POST /api/assignments with A's seat as B → 4xx, no assignment written", async () => {
    const res = await authedFetch(
      jar,
      ROUTES.apiAssignments,
      jsonInit("POST", { guestId: b.guestHiId, seatId: a.seatId }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const rows = await createServiceClient().from("assignments").select("id").eq("guest_id", b.guestHiId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(0);
  });

  // IDOR-via-payload: a conflict referencing A's guests is refused and no conflict lands in B's wedding.
  it("POST /api/conflicts referencing A's guests as B → 4xx, no conflict written", async () => {
    const res = await authedFetch(
      jar,
      ROUTES.apiConflicts,
      jsonInit("POST", { guestAId: a.guestLoId, guestBId: a.guestHiId }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const rows = await createServiceClient().from("guest_conflicts").select("id").eq("wedding_id", b.weddingId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1); // only B's seeded canonical pair
  });
});
