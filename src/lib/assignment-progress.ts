import type { Assignment, Guest } from "@/types";

/** Wedding-wide seating progress: guests with a seat over all guests entered. */
interface Progress {
  assigned: number;
  total: number;
  isComplete: boolean;
}

// Progress is independent of conflict validation: a conflicting pair seated adjacent still counts toward `assigned`.
export function computeProgress(guests: Guest[], assignments: Assignment[]): Progress {
  const assigned = assignments.length;
  const total = guests.length;
  return { assigned, total, isComplete: total > 0 && assigned === total };
}
