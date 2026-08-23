import type { Assignment, Conflict, Table, Violation } from "@/types";

// Canonical key for an unordered guest pair, matching guest_conflicts' `guest_a_id < guest_b_id` order.
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Adjacency violations for one table: each pair of adjacent occupied seats whose guests conflict.
 * Seats form a ring in `seat_number` order; seat i neighbors (i±1) mod seatCount.
 * `assignmentBySeatId` maps seatId → guestId; `conflictSet` holds canonical pair keys.
 */
export function validateTable(
  table: Table,
  assignmentBySeatId: Map<string, string>,
  conflictSet: Set<string>,
): Violation[] {
  const seats = table.seats;
  const seatCount = seats.length;
  if (seatCount < 2) return [];
  const violations: Violation[] = [];
  // A 2-seat ring has a single edge (0–1); the general loop would visit it twice, so cap iterations at 1.
  const edgeCount = seatCount === 2 ? 1 : seatCount;
  for (let i = 0; i < edgeCount; i++) {
    const seatA = seats[i];
    const seatB = seats[(i + 1) % seatCount];
    const guestA = assignmentBySeatId.get(seatA.id);
    const guestB = assignmentBySeatId.get(seatB.id);
    if (!guestA || !guestB) continue;
    if (!conflictSet.has(pairKey(guestA, guestB))) continue;
    violations.push({
      tableId: table.id,
      guestAId: guestA,
      guestBId: guestB,
      seatAId: seatA.id,
      seatBId: seatB.id,
    });
  }
  return violations;
}

/** Full re-scan: maps validateTable over every table, building the shared lookup structures once. */
export function validateAllTables(tables: Table[], assignments: Assignment[], conflicts: Conflict[]): Violation[] {
  const assignmentBySeatId = new Map(assignments.map((a) => [a.seatId, a.guestId]));
  const conflictSet = new Set(conflicts.map((c) => pairKey(c.guestAId, c.guestBId)));
  return tables.flatMap((table) => validateTable(table, assignmentBySeatId, conflictSet));
}
