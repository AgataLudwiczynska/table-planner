# Ring legibility for large tables (16–30 seats)

**Born:** S-03 Phase 5 manual verification (2026-08-23).
**Target:** future / UI polish (S-03 ring).
**Status:** OPEN.

## Finding

Phase 5 renders each table as a ring of first-name chips. It is legible up to ~15 seats. The
product allows up to 30 seats per table (F-01 `create_table_with_seats` / S-01 `zod` 1–30), and at
that count the fixed-radius ring packs the chips too tightly — they touch/overlap and the ring
becomes hard to read.

## Why deferred, not fixed now

- S-03 ships on manual verification; its acceptance is assignment + real-time adjacency validation,
  both of which work correctly at any seat count — only the *visual density* degrades.
- A robust fix is real design work with several viable directions (below), not a one-liner; picking
  one deserves its own small plan rather than being smuggled into the final phase.

## Options to weigh when picked up

1. **Scale the ring radius with seat count** — larger `n` → larger box, so circumference grows with
   the chip count (cap the box so the page stays responsive).
2. **Switch representation above a threshold** — name chips up to ~15 seats; compact
   initials-avatars (full name in tooltip) beyond, so nodes stay small.
3. **Radial name labels** — a small seat dot on the ring with the name set outside the circle,
   aligned radially.
4. Combination: scale radius moderately + initials fallback for the largest tables.

## Acceptance when done

A 30-seat table renders with every seat label readable and non-overlapping, still responsive with no
horizontal overflow, preserving all DnD / click / validation behavior.
