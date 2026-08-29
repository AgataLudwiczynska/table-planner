import { describe, it, expect } from "vitest";
import { validateAllTables } from "@/lib/adjacency";

// Throwaway config sanity check: proves the runner boots and the @/* alias resolves.
// Superseded by the real oracle suite in Phase 2.
describe("vitest bootstrap smoke", () => {
  it("resolves the @/ alias and returns [] for empty inputs", () => {
    expect(validateAllTables([], [], [])).toEqual([]);
  });
});
