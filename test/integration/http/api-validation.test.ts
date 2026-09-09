import { beforeAll, describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";
import { createServiceClient, seededUserB } from "../fixtures";
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

// Risk #5: hostile/malformed payloads must return a clean 4xx from the catalog with no partial write.
// Assert on status + code, never the copied Polish message (oracle problem).
describe("API payload contract — malformed input → clean 4xx", () => {
  let jar: CookieJar;
  let b: SeededUser;

  beforeAll(async () => {
    b = seededUserB();
    await assertPreviewReachable();
    jar = await signIn(b.email, b.password);
  });

  it("seatCount below 1 → 400 invalid_seat_count", async () => {
    const res = await authedFetch(jar, ROUTES.apiTables, jsonInit("POST", { name: "Stół X", seatCount: 0 }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("invalid_seat_count");
  });

  it("seatCount above 30 → 400 invalid_seat_count", async () => {
    const res = await authedFetch(jar, ROUTES.apiTables, jsonInit("POST", { name: "Stół X", seatCount: 31 }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("invalid_seat_count");
  });

  it("non-numeric seatCount → 400 invalid_seat_count", async () => {
    const res = await authedFetch(jar, ROUTES.apiTables, jsonInit("POST", { name: "Stół X", seatCount: "four" }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("invalid_seat_count");
  });

  it("missing required name → 400 validation_error", async () => {
    const res = await authedFetch(jar, ROUTES.apiTables, jsonInit("POST", { seatCount: 4 }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("validation_error");
  });

  it("unparseable JSON body → 400 validation_error", async () => {
    const res = await authedFetch(jar, ROUTES.apiTables, jsonInit("POST", "{ not valid json"));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("validation_error");
  });

  it("guest with empty firstName → 400 validation_error", async () => {
    const res = await authedFetch(jar, ROUTES.apiGuests, jsonInit("POST", { firstName: "", lastName: "Nowak" }));
    const { status, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("validation_error");
  });

  // No partial write: every create above was rejected, so B still has only its one seeded table.
  it("no table row was written by any rejected create", async () => {
    const rows = await createServiceClient().from("tables").select("id").eq("wedding_id", b.weddingId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
  });
});
