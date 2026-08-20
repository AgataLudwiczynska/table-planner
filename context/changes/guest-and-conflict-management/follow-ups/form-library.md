# Follow-up: evaluate a form-handling library

- **ID:** F4
- **Target:** future / DX (cross-cutting; no single slice)
- **Status:** OPEN
- **Raised in:** S-02 (guest-and-conflict-management), Phase 4 wrap-up

## What

Consider introducing a dedicated form-handling library (e.g. React Hook Form, optionally
with a zod resolver so the client shares the `zod` schemas already used by the API endpoints)
to manage the growing number of interactive forms in the wedding workspace.

## Why

Form state in the island is currently hand-rolled with `useState` per field plus manual
validation and per-field error objects. As of S-02 this pattern is repeated across the
rename input, add-table form, the guest add/edit form (`GuestsTab`), and the conflict pair
picker (`ConflictsTab`). Each hand-manages field values, touched/error state, reset, and
submit wiring. A form library would:

- cut the boilerplate (field registration, validation, error surfacing, reset),
- let the client reuse the endpoints' `zod` schemas instead of re-implementing rules,
- make future forms (S-03+) more consistent and less error-prone.

## Considerations before adopting

- Weigh the added dependency against the app's small scale — validation logic is currently
  simple. The win grows with form count/complexity.
- Keep the shared `FormField`/`ServerError` components and the light `fieldTheme`; a library
  would sit underneath them, not replace them.
- Check compatibility with the enforced React Compiler / Rules-of-React lint config.

## Not doing now

Deferred, not scheduled — revisit when the next batch of forms lands or during a DX pass.
