import { describe, it, expect } from "vitest";
import { validateAllTables, validateTable } from "@/lib/adjacency";
import type { Assignment, Conflict, Seat, Table, Violation } from "@/types";

// --- Typed fixture factories (domain shapes from src/types.ts, camelCase) ---

// Seats ascending by seatNumber, mirroring the server's seat_number sort — array index IS the ring order.
function ringTable(id: string, n: number): Table {
  const seats: Seat[] = Array.from({ length: n }, (_, i) => ({ id: `${id}-s${i + 1}`, seatNumber: i + 1 }));
  return { id, name: id, seatCount: n, seats };
}

function assign(seatId: string, guestId: string): Assignment {
  return { id: `a-${seatId}`, guestId, seatId };
}

function conflict(guestAId: string, guestBId: string): Conflict {
  return { id: `c-${guestAId}-${guestBId}`, guestAId, guestBId };
}

// validateTable's private inputs: replicate the canonical `a < b` pairKey the module builds internally.
function conflictSet(...pairs: [string, string][]): Set<string> {
  return new Set(pairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
}
function seatToGuest(...entries: [string, string][]): Map<string, string> {
  return new Map(entries);
}

// guestAId/guestBId are in adjacency order, not canonical UUID order — compare the flagged pair as an unordered set.
function flaggedPairs(violations: Violation[]): Set<string> {
  return new Set(violations.map((v) => [v.guestAId, v.guestBId].sort((a, b) => a.localeCompare(b)).join("|")));
}

describe("validateAllTables — adjacency-conflict guardrail (Risk #1)", () => {
  it("flags a conflict pair on adjacent seats (4-seat ring, edge 0-1)", () => {
    const t = ringTable("t1", 4);
    const violations = validateAllTables([t], [assign("t1-s1", "gA"), assign("t1-s2", "gB")], [conflict("gA", "gB")]);
    expect(violations).toHaveLength(1);
    expect(violations[0].tableId).toBe("t1");
    expect(new Set([violations[0].seatAId, violations[0].seatBId])).toEqual(new Set(["t1-s1", "t1-s2"]));
    expect(flaggedPairs(violations)).toEqual(new Set(["gA|gB"]));
  });

  it("does not flag a conflict pair on non-adjacent seats (indices 0 and 2)", () => {
    const t = ringTable("t1", 4);
    const violations = validateAllTables([t], [assign("t1-s1", "gA"), assign("t1-s3", "gB")], [conflict("gA", "gB")]);
    expect(violations).toEqual([]);
  });

  it("flags the wrap edge: seat N adjacent to seat 1 (indices N-1 and 0)", () => {
    const t = ringTable("t1", 4);
    // gA at index 3 (seat N), gB at index 0 (seat 1) — the only adjacent occupied pair is the wrap edge (3,0).
    const violations = validateAllTables([t], [assign("t1-s4", "gA"), assign("t1-s1", "gB")], [conflict("gA", "gB")]);
    expect(violations).toHaveLength(1);
    expect(new Set([violations[0].seatAId, violations[0].seatBId])).toEqual(new Set(["t1-s4", "t1-s1"]));
    expect(flaggedPairs(violations)).toEqual(new Set(["gA|gB"]));
  });

  it("does not flag when only one seat of an adjacent conflict pair is occupied", () => {
    const t = ringTable("t1", 4);
    const violations = validateAllTables([t], [assign("t1-s1", "gA")], [conflict("gA", "gB")]);
    expect(violations).toEqual([]);
  });

  it("is order-independent: conflict stored (A,B) flags in both adjacency seatings", () => {
    const t = ringTable("t1", 4);
    const c = [conflict("gA", "gB")]; // canonical (gA < gB)
    // Seating (A,B): gA at s1, gB at s2.
    const ab = validateAllTables([t], [assign("t1-s1", "gA"), assign("t1-s2", "gB")], c);
    expect(flaggedPairs(ab)).toEqual(new Set(["gA|gB"]));
    // Seating (B,A): gB at s1, gA at s2 — the naive re-impl silently drops this flag.
    const ba = validateAllTables([t], [assign("t1-s1", "gB"), assign("t1-s2", "gA")], c);
    expect(flaggedPairs(ba)).toEqual(new Set(["gA|gB"]));
  });

  it("attributes each violation to the correct table (cross-table independence)", () => {
    const t1 = ringTable("t1", 4);
    const t2 = ringTable("t2", 4);
    const violations = validateAllTables(
      [t1, t2],
      [assign("t1-s1", "gA"), assign("t1-s2", "gB"), assign("t2-s1", "gC"), assign("t2-s2", "gD")],
      [conflict("gA", "gB"), conflict("gC", "gD")],
    );
    expect(violations).toHaveLength(2);
    expect(new Set(violations.map((v) => v.tableId))).toEqual(new Set(["t1", "t2"]));
    expect(flaggedPairs(violations.filter((v) => v.tableId === "t1"))).toEqual(new Set(["gA|gB"]));
    expect(flaggedPairs(violations.filter((v) => v.tableId === "t2"))).toEqual(new Set(["gC|gD"]));
  });

  it("does not flag a conflict pair split across two tables (not adjacent anywhere)", () => {
    const t1 = ringTable("t1", 4);
    const t2 = ringTable("t2", 4);
    const violations = validateAllTables(
      [t1, t2],
      [assign("t1-s1", "gA"), assign("t2-s1", "gB")],
      [conflict("gA", "gB")],
    );
    expect(violations).toEqual([]);
  });
});

describe("validateTable — pure ring geometry", () => {
  it("counts the 2-seat degenerate ring's single edge exactly once (not twice)", () => {
    const t = ringTable("t1", 2);
    const violations = validateTable(t, seatToGuest(["t1-s1", "gA"], ["t1-s2", "gB"]), conflictSet(["gA", "gB"]));
    // The double-count guard: the general loop would emit (0,1) and (1,0); edgeCount caps it at one.
    expect(violations).toHaveLength(1);
    expect(flaggedPairs(violations)).toEqual(new Set(["gA|gB"]));
  });

  it("yields no edges for a 1-seat table", () => {
    const t = ringTable("t1", 1);
    expect(validateTable(t, seatToGuest(["t1-s1", "gA"]), conflictSet(["gA", "gB"]))).toEqual([]);
  });

  it("yields no edges for an empty (0-seat) table", () => {
    const t = ringTable("t1", 0);
    expect(validateTable(t, seatToGuest(), conflictSet(["gA", "gB"]))).toEqual([]);
  });
});
