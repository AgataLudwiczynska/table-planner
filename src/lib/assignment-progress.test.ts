import { describe, it, expect } from "vitest";
import { computeProgress } from "@/lib/assignment-progress";
import type { Assignment, Guest } from "@/types";

// --- Typed fixture factories (domain shapes from src/types.ts, camelCase) ---

function guest(id: string, firstName: string, lastName: string): Guest {
  return { id, firstName, lastName, side: null, group: null };
}

function assign(seatId: string, guestId: string): Assignment {
  return { id: `a-${seatId}`, guestId, seatId };
}

// A small realistic guest list reused across cases.
const jan = guest("jan-kowalski", "Jan", "Kowalski");
const anna = guest("anna-nowak", "Anna", "Nowak");
const piotr = guest("piotr-wisniewski", "Piotr", "Wiśniewski");
const maria = guest("maria-wojcik", "Maria", "Wójcik");
const katarzyna = guest("katarzyna-zielinska", "Katarzyna", "Zielińska");

describe("computeProgress — guests-seated counter (S-05)", () => {
  it("reports 0 / 0 and not complete when no guests are entered", () => {
    expect(computeProgress([], [])).toEqual({ assigned: 0, total: 0, isComplete: false });
  });

  it("counts the full guest list as total even when none are seated", () => {
    const guests = [jan, anna, piotr, maria, katarzyna];
    expect(computeProgress(guests, [])).toEqual({ assigned: 0, total: 5, isComplete: false });
  });

  it("counts partial seating as assigned < total, not complete", () => {
    const guests = [jan, anna, piotr, maria, katarzyna];
    // Two of five guests seated.
    const assignments = [assign("t1-s1", jan.id), assign("t1-s2", anna.id)];
    expect(computeProgress(guests, assignments)).toEqual({ assigned: 2, total: 5, isComplete: false });
  });

  it("is complete when every entered guest has a seat (assigned === total, total > 0)", () => {
    const guests = [jan, anna, piotr];
    const assignments = [assign("t1-s1", jan.id), assign("t1-s2", anna.id), assign("t1-s3", piotr.id)];
    expect(computeProgress(guests, assignments)).toEqual({ assigned: 3, total: 3, isComplete: true });
  });

  it("counts a seated conflicting pair toward assigned — progress is independent of validation", () => {
    // Jan and Anna are a registered conflict pair, yet both seated (adjacent). The counter still includes both;
    // computeProgress takes no conflicts — the violation is surfaced elsewhere — so the pair can still complete the list.
    const guests = [jan, anna];
    const assignments = [assign("t1-s1", jan.id), assign("t1-s2", anna.id)];
    expect(computeProgress(guests, assignments)).toEqual({ assigned: 2, total: 2, isComplete: true });
  });
});
