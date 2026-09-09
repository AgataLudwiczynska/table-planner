import { beforeAll, describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";
import { seededUserB } from "../fixtures";
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

// Risk #5: echoing the client's input in an error body would leak a guest's personal data;
// each spec sends a recognizable value and asserts the body does not contain it.
describe("API error bodies never echo client input", () => {
  let jar: CookieJar;
  let b: SeededUser;

  beforeAll(async () => {
    b = seededUserB();
    await assertPreviewReachable();
    jar = await signIn(b.email, b.password);
  });

  it("a malformed guest id in a conflict payload is not reflected in the error body", async () => {
    const forgedGuestId = "not-a-uuid-jan-kowalski";
    const res = await authedFetch(
      jar,
      ROUTES.apiConflicts,
      jsonInit("POST", { guestAId: forgedGuestId, guestBId: b.guestLoId }),
    );
    const { status, raw, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("validation_error");
    expect(raw).not.toContain(forgedGuestId);
  });

  it("an over-long guest name is not reflected in the error body", async () => {
    const guestFirstName = "Genowefa";
    const res = await authedFetch(
      jar,
      ROUTES.apiGuests,
      jsonInit("POST", { firstName: guestFirstName + "a".repeat(200), lastName: "Kowalska" }),
    );
    const { status, raw, json } = await readResponse(res);
    expect(status).toBe(400);
    expect(errorCode(json)).toBe("validation_error");
    expect(raw).not.toContain(guestFirstName);
  });
});
