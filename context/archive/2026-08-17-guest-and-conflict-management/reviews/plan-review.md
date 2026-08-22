<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-02 — Guest & Conflict Management

- **Plan**: context/changes/guest-and-conflict-management/plan.md
- **Mode**: Deep
- **Date**: 2026-08-17
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

13/13 paths ✓, db:types script ✓, guests/guest_conflicts absent from generated types (0) ✓, brief↔plan ✓, roadmap S-02 risk note + PRD FR-010..016 refs ✓, RLS/owner-chain template verified against F-01 migration.

## Findings

### F1 — Searchable picker resolves guest by display name, not id

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 §3 — Konflikty tab (searchable pair picker)
- **Detail**: The contract says the picker "maps a display name back to a guest id" (the `<datalist>` variant especially keys on the visible name). At target_scale ≤150 guests, two guests sharing first + last name is common in practice (father/son, cousins). Name→id resolution then silently picks the wrong guest or fails to resolve, producing a valid-but-wrong pair the server cannot catch (it validates the ids it receives). Degrades a promised feature (FR-014) in a realistic case.
- **Fix A ⭐ Recommended**: Picker carries the guest id directly — minimal in-island type-to-filter dropdown over `{id, name}` objects; selecting stores the id in state, never round-tripping through the display string.
  - Strength: Disambiguates identical names; no new dependency — same "build it in-island" path the plan already allows.
  - Tradeoff: Slightly more component code than a bare `<datalist>`.
  - Confidence: HIGH — the plan already lists an in-island combobox as an acceptable option; this makes it the chosen one.
  - Blind spot: None significant.
- **Fix B**: Keep `<datalist>` but encode the id in the option value (id, or "Name · short-id"); map back by id.
  - Strength: Least new code.
  - Tradeoff: The `value` is what the `<input>` displays — an id/suffix is ugly; awkward UX.
  - Confidence: MED — works, but datalist's display/value coupling fights you.
  - Blind spot: Accessibility of the mangled value string unverified.
- **Decision**: FIXED — Fix differently: enforce `unique (wedding_id, first_name, last_name)` on guests so display names resolve to a single id; operator disambiguates real duplicates by editing the name (e.g. `Kowalska (ciocia)`), colliding add/edit rejected with new `guest_name_exists` (409). Applied across Phases 1–4 + Key Discoveries.

### F2 — Inconsistent "not found" handling; `guest_not_found` defined but unused

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (error codes) + §3 (guest service) vs §4 (conflict service)
- **Detail**: Phase 2 adds `guest_not_found` (404), but the guest service routes empty results elsewhere: `updateGuest` "empty → internal_error, mirroring renameWedding" and `deleteGuest` per the S-01 convention (renameWedding also → internal_error, confirmed at `src/lib/services/wedding.service.ts:45,52`). So `guest_not_found` has no caller (dead code). Meanwhile `deleteConflict` maps empty → `conflict_not_found` (404). Two sibling services in the same slice handle the identical "row not found / not owned" case two different ways, and one defined code is never wired up.
- **Fix A ⭐ Recommended**: Return the `*_not_found` codes in both services — `updateGuest`/`deleteGuest` empty → `guest_not_found` (404), matching `deleteConflict`.
  - Strength: Consistent within the slice; informative 404 over an opaque 500; uses the code the plan already defines.
  - Tradeoff: Diverges from renameWedding's deliberate "ambiguous → 500" choice.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Follow renameWedding — empty → internal_error in both services; drop `guest_not_found` and change `deleteConflict` to internal_error too.
  - Strength: One convention across S-01 + S-02.
  - Tradeoff: Loses the friendly 404s (`guest_not_found` and `conflict_not_found`).
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A: `updateGuest`/`deleteGuest` empty result → `guest_not_found` (404), consistent with `deleteConflict`; wires up the previously-dead code.

### F3 — Denormalized `wedding_id` on guest_conflicts has no DB-level invariant

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §1 — guest_conflicts contract
- **Detail**: guest_conflicts carries its own `wedding_id` "to keep the owner-chain policy a single join," but nothing at the DB guarantees it equals the two guests' wedding_id — only the service sets it. The RLS `with check` validates the conflict's wedding_id is owned and the FKs guarantee the guests exist, but a service bug could write a conflict whose wedding_id ≠ its guests' wedding. In practice this holds (service sets it from the same weddingId it validates the guests against; no UPDATE on conflicts; guests can't change wedding), so it's a latent smell, not a live bug.
- **Fix**: Accept as-is (service is the sole guarantor — already true for the "both guests in wedding" rule), OR route the owner policy through `guest_a_id → guests.wedding_id → weddings` and drop the redundant column. Given the plan's performance/FK-index rationale, keeping the column + documenting the "service-set invariant" is the pragmatic call.
- **Decision**: FIXED — Accept + document: kept the column for owner-chain performance; Phase 1 §1 contract now states no DB-level invariant ties the conflict's `wedding_id` to the guests' `wedding_id` and the service is the sole guarantor.

---

## Re-review (2026-08-18) — new findings

Second pass over the revised plan. F1–F3 above are resolved and folded into the plan. New findings below.

- **Mode**: Deep
- **Date**: 2026-08-18
- **Verdict**: REVISE
- **New findings**: 1 critical (F4), 1 warning (F5), 1 observation (F6)

### Verdicts (2026-08-18)

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

### Grounding (2026-08-18)

10/10 paths ✓, 4/4 symbols ✓ (getWedding, db:types script, useApiMutation, docs/reference/rls-verification-protocol.md), brief↔plan ✓. RLS/owner-chain + FK-index template re-verified against F-01 migration; Progress↔Phase mechanical scan run across all four phases.

### F4 — Phase 4 success criterion has no matching Progress entry

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Success Criteria (line 283) ↔ Progress (4.3–4.8)
- **Detail**: The Progress↔Phase mechanical contract requires every Success Criteria bullet to have a matching `- [ ] N.M` entry. Phase 4's manual criterion "Empty required fields show inline errors and create nothing" (line 283) has no counterpart in Progress — Phase 4 stops at 4.8. Every other bullet across all four phases maps cleanly; this is the only gap. It leaves one manual verification untracked by /10x-implement.
- **Fix**: Add `- [ ] 4.9 Empty required guest fields show inline errors and create nothing` under Progress → Phase 4 → Manual.
- **Decision**: FIXED — added 4.9 (empty required fields). Also added, at the user's request, a Phase 4 manual criterion + Progress 4.10 for the duplicate-name case (adding a second guest with the same first+last name → inline `guest_name_exists`, nothing created).

### F5 — Cross-tab shared state ownership left unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 §1–3 (WeddingWorkspace / GuestsTab / ConflictsTab)
- **Detail**: The guests and conflicts arrays are shared across two sibling tabs, but the plan describes both as "local state": GuestsTab (§2) must "drop any conflicts referencing that guest from local state" on delete; ConflictsTab (§3) resolves names from "the local guests list" and its picker must offer newly-added guests. If each tab holds its own `useState(initialGuests/Conflicts)`, the two desync until reload — a guest added in Goście won't appear in the Konflikty picker, and deleting a guest in Goście can't remove its conflicts held in ConflictsTab. The plan never states the mutable arrays live in the parent island, even though WeddingWorkspace already owns `tables`/`wedding` via `useState` this exact way (src/components/wedding/WeddingWorkspace.tsx:32-34).
- **Fix A ⭐ Recommended**: Specify that `guests` and `conflicts` state (and their setters) live in WeddingWorkspace and are passed to GuestsTab / ConflictsTab as props + updater callbacks — mirroring how the island already owns `tables`. Tabs render and call up; they don't own the arrays.
  - Strength: One source of truth; both tabs stay consistent without a reload; matches the island's existing state pattern.
  - Tradeoff: Slightly more prop plumbing than per-tab state.
  - Confidence: HIGH — WeddingWorkspace already owns tables/wedding this way.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A: Phase 4 §1 now has a "State ownership" clause (WeddingWorkspace owns guests/conflicts via useState, passes them + updater callbacks to the tabs); §2 and §3 reworded from "local state" to the shared parent-owned state.

### F6 — Picker "unresolved name" behavior unspecified

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §3 — Konflikty searchable picker
- **Detail**: A datalist/free-text input lets the operator type a string that isn't an exact guest name. Unique-per-wedding names (added by prior F1) make an exact match resolve to one id, but the plan doesn't say what happens when the typed text resolves to no id — there's no guestId to submit, and "server remains authoritative" doesn't cover it because the request never forms.
- **Fix**: State the resolve-or-block rule — keep "Dodaj konflikt" disabled until both inputs map to a valid guest id (or show an inline hint on an unmatched name).
- **Decision**: FIXED — Phase 4 §3 Intent now states "Dodaj konflikt" stays disabled until both inputs resolve to a valid guest id; an unmatched free-text entry maps to no id and must not submit.

---

## Re-review verdict (2026-08-18, post-triage)

Fresh pass after F4–F6 were fixed. All five dimensions PASS; Progress↔Phase balances (Phase 4: 8 criteria ↔ 4.3–4.10). **Overall: SOUND — ready for /10x-implement.** No blocking findings. Two cosmetic wording leftovers were tidied in the plan: `plan.md` §2 GuestsTab Intent ("local state" → shared state owned by `WeddingWorkspace`) and Critical Implementation Details ("group" column framed as decided `guest_group`, not still-open).
