---
change_id: guest-and-conflict-management
title: Add, edit, and delete guests; define and remove conflict pairs
status: plan_reviewed
created: 2026-08-17
updated: 2026-08-18
archived_at: null
---

## Notes

Roadmap slice **S-02** (`context/foundation/roadmap.md`). Guest CRUD (name, side, group) plus binary "not next to each other" conflict pairs — define, list, remove. No severity tiers. Prerequisite F-01 (schema + RLS) is done; runs parallel to S-01. Both S-01 and S-02 must land before S-03 (north star: real-time adjacency validation).

Watch-out from roadmap risk note: model conflicts as `(guest_a_id, guest_b_id)` with a **canonical order (smaller id first)** and a unique constraint on the ordered pair, so (A,B) and (B,A) can't both exist — otherwise S-03's violation counting breaks.

PRD refs: FR-010, FR-011, FR-012, FR-014, FR-015, FR-016.
