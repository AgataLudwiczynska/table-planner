<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Table Edit with Guest Auto-Unassign (S-04)

- **Plan**: context/changes/table-edit-with-guest-auto-unassign/plan.md
- **Scope**: Full plan — Phases 1–3 of 3 (Release phase still pending, not in scope)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Purpose-built `confirm-dialog.tsx` instead of the full shadcn alert-dialog kit

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/ui/confirm-dialog.tsx
- **Detail**: Phase 3 step 2 said to `npx shadcn@latest add alert-dialog` and create `src/components/ui/alert-dialog.tsx`. The implementation instead hand-wrote a single `ConfirmDialog` wrapper over `@radix-ui/react-alert-dialog` (the exact dependency the plan predicted). This is beneficial, not a regression: it matches the recorded preference for minimal purpose-built wrappers over shadcn's flat multi-export kit, the underlying Radix primitive and dep are identical, and the wrapper exposes exactly the title/description/Anuluj/action surface the two dialogs need.
- **Fix**: None needed — accept as an intentional, documented-preference deviation. No plan edit required unless you want the plan's source-of-truth to match reality.
- **Decision**: DOCUMENTED (plan addendum "Post-Implementation Addenda") + ACCEPTED-AS-RULE ("Prefer a minimal purpose-built wrapper over the full shadcn kit for few-use UI primitives"). No code change — code already conforms.

### F2 — Unplanned `src/lib/table-constraints.ts` shared-constants module

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/table-constraints.ts
- **Detail**: A new module exporting `TABLE_NAME_MAX_LENGTH`, `SEATS_MIN`, `SEATS_MAX` was added; it is not mentioned in the plan. It is consumed by both the API zod schema (`api/tables.ts:7`) and the form validation (`TablesTab.tsx:8`), making the 1–30 / 50-char limits a single source of truth across client + server + (mirrored in) the DB RPC. Benign and aligned with the "hoist shared constants" preference; the only note is it was introduced silently rather than as a plan addendum.
- **Fix**: None needed — keep it. Optionally add a one-line addendum to the plan so the source-of-truth records the extra module.
- **Decision**: ACCEPTED-AS-RULE ("Share validation limits via one constants module (client + server + DB)"). No code change — module kept as-is.

### F3 — PATCH returns 403 while DELETE returns 404 for a table the caller can't touch

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/table.service.ts:67 (updateTable) vs :92 (deleteTable)
- **Detail**: For a `tableId` that does not exist or belongs to another account, `PATCH` surfaces the RPC ownership guard's `42501` → `forbidden` (403), while `DELETE` sees RLS drop 0 rows → `table_not_found` (404). Both are safe "you can't act on this" responses and neither mutates, but the two endpoints report the same not-accessible condition with different codes. This stems from the two different enforcement mechanisms (RPC guard vs RLS) and is arguably by-design (PATCH avoids leaking existence). Worth a conscious note, not a fix.
- **Fix**: None needed — accept the difference as a consequence of RPC-guard vs RLS enforcement. If uniformity is wanted later, map the RPC path so a missing/own-less table also yields 404.
- **Decision**: ACCEPTED (by design — PATCH's 403 avoids leaking table existence; no change).

## Notes (not findings)

- **Critical ordering verified**: the resize RPC captures freed guest ids *before* the seat delete cascade (`20260911120000_table_update_rpc.sql:35-44`) and reads `v_current_count` before the `UPDATE` — exactly the load-bearing sequence the plan flagged. `deleteTable` mirrors this by collecting `unassignedGuestIds` before the `DELETE`.
- **Security**: ownership enforced server-side on both paths (RPC `auth.uid()` guard for PATCH; RLS for DELETE); client `tableId` validated by zod and never otherwise trusted. `revoke … from public, anon; grant … to authenticated` grants present, matching the F-01 pattern and the RLS-anon lesson. The RPC's bare `auth.uid()` in the guard is correct — the `(select auth.uid())` initPlan optimization applies to per-row RLS policies, not a one-shot function guard.
- **F1 follow-up (seat_count ceiling)** closed at three layers: DB RPC `22023` guard, API zod `.max(SEATS_MAX)`, and form validation.
- **State reconciliation** correctly drops freed assignments so the derived unassigned panel + violations recompute with no refetch (`WeddingWorkspace.tsx:81-94`).
- **Release phase pending (expected)**: R.1 prod migration apply (load-bearing per the prod-apply lesson — the plan does include it), R.2/R.3 follow-up bookkeeping. Not drift; just not done yet.
- **Success Criteria**: all Phase 1–3 automated checks are marked `[x]` against commits 673c5d4 / 65cfac4 / 74174bb. Not re-run in this review session (pending your go-ahead to run `npm run lint`, `npx astro check`, `npm run test:run`).
