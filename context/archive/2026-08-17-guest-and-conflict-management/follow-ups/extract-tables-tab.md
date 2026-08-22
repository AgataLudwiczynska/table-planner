# Follow-up: extract TablesTab and encapsulate table-form state

- **ID:** F5
- **Target:** future / refactor (component structure; no behaviour change)
- **Status:** OPEN
- **Raised in:** S-02 (guest-and-conflict-management), post-impl-review

## What

Extract the "Stoły" tab out of `WeddingWorkspace.tsx` into its own
`src/components/wedding/TablesTab.tsx`, mirroring `GuestsTab.tsx` and
`ConflictsTab.tsx`. Move the table-form state and logic into that component:
`tableName`, `seatCount`, the table `fieldErrors`, and `addTable`. `TablesTab`
can own its `tables` array outright — unlike `guests`, that state is used by no
other tab.

## Why

There is an asymmetry: guests and conflicts each live in their own `*Tab.tsx`
and keep their form state locally, while the tables tab is implemented inline in
`WeddingWorkspace` with its form state hoisted into the orchestrator
(`tableName` / `seatCount` / `fieldErrors` at lines ~57-59, `addTable` at
~85-112). The real gain is **encapsulation**, not mere file symmetry: extracting
removes ~55 lines of one tab's state and logic from the component that should
only orchestrate state, tab switching, and data flow.

## Considerations before doing it

- Pure refactor — **no behaviour change**. Keep it in its own PR so the diff is
  easy to review and can't regress already-shipped table functionality.
- The wedding-name rename (`nameDraft` / `saveName` / `rename`) is the header,
  not a tab — it stays in `WeddingWorkspace` regardless. The orchestrator won't
  become a "pure router", and that's fine.
- Accept the mild irregularity that `TablesTab` owns its own array while
  `GuestsTab` / `ConflictsTab` receive `guests` from the parent (conflicts needs
  guests). This is inherent to the data-sharing shape, not a smell to fix.
- `fieldTheme` and `serverErrorClass` are already passed down to the sibling
  tabs — reuse the same prop pattern.

## Not doing now

Deferred — out of scope for the guest/conflict feature branch (would mix a
refactor of previously shipped code into a feature PR). Schedule as a standalone
small refactor.
