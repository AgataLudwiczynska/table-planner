# Wedding-scope Schema + RLS Foundation (F-01) — Plan Brief

> Full plan: `context/changes/wedding-scope-schema-and-rls/plan.md`

## What & Why

Utworzyć pierwszą migrację TablePlannera: schema `weddings`/`tables`/`seats` z RLS ograniczającym każdą operację do właściciela oraz atomową funkcję RPC do tworzenia stołu wraz z miejscami. F-01 to fundament, którego pattern skopiują S-02 (`guests+conflicts`) i S-03 (`assignments`); błąd w RLS oznacza wyciek danych między kontami — guardrail "Prywatność danych" z PRD — więc dostaje dedykowany review PRZED jakąkolwiek pracą user-facing.

## Starting Point

Repo ma auth Supabase wpięty przez `@supabase/ssr` (`src/lib/supabase.ts` + `src/middleware.ts`) i local Supabase gotowe do `npx supabase start`, ale `supabase/migrations/` nie istnieje — F-01 tworzy pierwszą migrację i ustala wszystkie konwencje (naming SQL-a, RLS pattern, RPC-dla-atomicznych-cross-table pattern, workflow typów TS, verification protocol). Deployment-plan §0.3 (`supabase login` + `link`) explicit odłożone "aż do pierwszej migracji" — F-01 to odblokowuje.

## Desired End State

Trzy tabele istnieją lokalnie i na produkcji z RLS enabled. 8 policies (weddings ×4, tables ×3, seats ×1 — tylko realne ścieżki dostępu; write na tables/seats idą przez RPC) scoped `TO authenticated` z ownership check chain przez FK. Atomowa RPC `create_table_with_seats` tworzy stół + N miejsc w jednej transakcji z explicit ownership guard. Generowane typy TS (`src/db/database.types.ts`) są źródłem prawdy; domain aliasy (`Wedding`, `Table`, `Seat`) w `src/types.ts`. Cross-account test przechodzi 6 kroków: user B nie widzi/nie zmienia/nie kasuje danych user A i nie oszuka RPC.

## Key Decisions Made

| Decision                | Choice                                                                                | Why (1 sentence)                                                                                       | Source |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| Modelowanie miejsc      | Osobna tabela `seats` z unique `(table_id, seat_number)`                              | DB egzekwuje invariant FR-019 przez FK + unique w S-03 `assignments (seat_id UNIQUE)`                  | Plan   |
| Auto-generacja seats    | RPC `create_table_with_seats` (SECURITY DEFINER + ownership check + `set search_path`) | Atomowość przez transakcję w funkcji; wywołanie grepowalne z TS; wzorzec skaluje się do S-04           | Plan   |
| Kolumna `shape`         | Skip                                                                                  | MVP = round-only per Non-Goals; `ALTER TABLE ADD COLUMN DEFAULT` w v2 to O(1) metadata-only w PG ≥ 11 | Plan   |
| RLS role targeting      | Policies `TO authenticated`; brak dla `anon` (default deny)                            | Idiom Supabase; explicit `TO anon USING(false)` to szum bez zysku (nie chroni czego default deny nie)   | Plan   |
| Typy TS                 | Generowane `src/db/database.types.ts` + hand-written DTO w `src/types.ts`             | Baza jako źródło prawdy, zero drift; `types.ts` zostaje na composite/API shapes                        | Plan   |
| Timestamps              | Tylko `created_at`, bez `updated_at`                                                  | Brak US/FR wymagającego "last modified"; ten sam trywialny koszt dodania później co dla `shape`         | Plan   |
| Podział na pliki SQL    | Jedna migracja `wedding_scope_schema_and_rls.sql`                                     | Cały fundament w jednym pliku do review; splittowanie per tabela nie daje wartości                     | Plan   |
| Weryfikacja RLS         | Manualny 6-step protokół w `docs/reference/rls-verification-protocol.md`               | Brak test runnera w repo; współdzielony doc to living reference dla S-02, S-03 (migracja tylko linkuje) | Plan   |

## Scope

**In scope:**

- Jedna migracja: 3 tabele + FK indeksy + 8 RLS policies (weddings ×4, tables ×3, seats ×1) + 1 RPC funkcja + `pgcrypto` extension guard
- `npm run db:types` script + wygenerowany `src/db/database.types.ts` + hand-written `src/types.ts` z 3 aliasami + ESLint ignore dla generowanego pliku
- CLAUDE.md — dopisek o `npm run db:types` po każdej migracji
- Manualny cross-account test (6 kroków) udokumentowany w `docs/reference/rls-verification-protocol.md` (migracja tylko linkuje)
- Push migracji na produkcję → odblokowanie deployment-plan §0.3 (`supabase login` + `link`)

**Out of scope:**

- `updated_at` na tabelach (defer — brak US)
- `shape` na `tables` (Non-Goals, defer)
- `guests`, `conflicts`, `assignments` (S-02, S-03)
- `resize_table` RPC (S-04)
- `zod`, API endpointy, service files (S-01)
- Automated test runner + integration tests (brak w repo, defer)
- Zmiany w `src/lib/supabase.ts`, `src/middleware.ts` (auth działa)

## Architecture / Approach

```
Request (Astro middleware attaches user via auth.getUser())
   │
   ▼
API endpoint (S-01 onwards)
   │
   ├─► CRUD single-table            ──►  PostgREST via @supabase/ssr  ──┐
   │   (guests, conflicts w S-02)                                        │
   │                                                                     ▼
   └─► Cross-table atomic op        ──►  supabase.rpc(...)  ──►  Postgres RLS
       (create_table_with_seats)                                 │
                                                                  ▼
                                       weddings ◄─FK─ tables ◄─FK─ seats
                                        │ user_id                   │ (table_id, seat_number) UNIQUE
                                        ▼
                                       auth.users
```

Foundation pattern: RLS chain (owner check propaguje przez FK subquery), RPC dla atomicznych cross-table operations, generowane typy TS jako źródło prawdy dla row-types.

## Phases at a Glance

| Phase                              | What it delivers                                     | Key risk                                                                                    |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Migracja: schema + RLS + RPC    | Jeden plik SQL, aplikacja przez `db reset` lokalnie   | RLS policy miss w chain (`seats` → `tables` → `weddings`) → cross-account leak              |
| 2. Typy TS integration             | `db:types` script + generated + hand-written types    | Strict ESLint blokuje generowany plik — wymaga ESLint ignore (`src/db/database.types.ts`)    |
| 3. RLS verification + prod push    | 6-step manual test + `db push`                       | Migration one-way; bug w RLS na prodzie wymaga forward-fix migracji (nie rollback)          |

**Prerequisites:** local Supabase boots (`npx supabase start`), Docker running, produkcyjne creds Supabase w password managerze (per deployment-plan §0.2)
**Estimated effort:** 1-2 sesje after-hours (~2-3 h razem); większość to Phase 1 (SQL + 8 policies + RPC), Phase 2/3 to ~30 min każde

## Open Risks & Assumptions

- **RLS subquery recursion** — policies dla `tables`/`seats` używają subquery do `weddings`. Postgres domyślnie oblicza policies rekursywnie, ale ten kierunek (`seats → tables → weddings`) jest bezpieczny (nie ma cyklu). Weryfikacja w Phase 3.1 kroki 3-5.
- **`gen_random_uuid()` wymaga `pgcrypto`** — Supabase zwykle ma default, ale migracja defensywnie robi `create extension if not exists pgcrypto`.
- **SECURITY DEFINER search_path hijack** — funkcja musi mieć `set search_path = public` (Postgres best practice); zawarte w snippecie RPC.
- **Produkcyjne creds gotowe** — Phase 3.2 wymaga zrobionego deployment-plan Phase 0.2 (user ma login + password manager entry). Jeśli nie — Phase 1+2 samodzielne, Phase 3.2 odkładamy do sesji z dostępem do produkcji.

## Success Criteria (Summary)

- 6-krokowy cross-account test przechodzi lokalnie (user B nie odczyta/nie zmieni/nie usunie danych user A; RPC podnosi `not_owner`)
- Produkcyjny Supabase dashboard pokazuje `weddings`/`tables`/`seats` z RLS badge + `create_table_with_seats` w Functions
- `import type { Wedding } from "@/types"` w kodzie appki działa z pełnym autouzupełnianiem po `npm run db:types`
