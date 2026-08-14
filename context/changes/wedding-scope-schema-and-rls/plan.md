# Wedding-scope Schema + RLS Foundation (F-01) — Implementation Plan

## Overview

Utworzyć pierwszą migrację TablePlannera: schemę `weddings`/`tables`/`seats` z RLS ograniczającym każdą operację do właściciela (`TO authenticated` + ownership chain przez FK) oraz atomową funkcję RPC `create_table_with_seats` (SECURITY DEFINER + explicit ownership check). Wpiąć `supabase gen types typescript` jako źródło prawdy dla typów wierszy, warstwę domain DTO trzymać w `src/types.ts`. Zweryfikować RLS testem cross-account i wypchnąć migrację na produkcyjny projekt Supabase (odblokowuje Phase 0.3 z deployment-plan).

## Current State Analysis

- `supabase/migrations/` **nie istnieje** — F-01 tworzy pierwszą migrację i ustala pattern dla S-02, S-03
- `supabase/config.toml` obecny z Postgres 17 (RLS dostępny) i lokalnym Supabase gotowym do `npx supabase start`
- `@supabase/ssr` client wpięty w `src/lib/supabase.ts:5` — czyta `SUPABASE_URL`/`SUPABASE_KEY` z `astro:env/server`
- `src/middleware.ts:11` resolvuje `context.locals.user` przez `auth.getUser()` na każdy request → RLS może polegać na `auth.uid()`
- `src/env.d.ts:3` deklaruje `App.Locals.user: User | null`
- `src/types.ts` **nie istnieje** — CLAUDE.md mandat "add it on first shared type" → F-01 to ten moment
- `zod` nieobecny w `package.json` — odkładany do S-01 (pierwszy endpoint domenowy)
- Deployment-plan §0.3 (`supabase login` + `link`) explicit odłożony "aż do pierwszej migracji" — F-01 to odblokowuje
- CLAUDE.md zasada: "Always enable RLS on new tables with granular per-operation, per-role policies"; "Migrations are one-way — `wrangler rollback` NOT reverts `supabase db push`"

## Desired End State

Po F-01:

- Trzy tabele (`weddings`, `tables`, `seats`) istnieją **lokalnie i na produkcji** z RLS enabled
- 8 RLS policies (weddings ×4, tables ×3, seats ×1 — tylko realne ścieżki dostępu) scoped `TO authenticated`, ownership check przez FK chain
- 1 RPC funkcja `create_table_with_seats(p_wedding_id uuid, p_name text, p_seat_count int) returns uuid` — atomowo tworzy stół + N miejsc po weryfikacji ownership
- `src/db/database.types.ts` istnieje i jest aktualny; `npm run db:types` regeneruje
- `src/types.ts` istnieje z aliasami `Wedding`, `Table`, `Seat` importowanymi z generated
- CLAUDE.md udokumentowany workflow: "po migracji `npm run db:types`"
- `docs/reference/rls-verification-protocol.md` istnieje jako współdzielony runbook; migracja i przyszłe S-02/S-03 linkują do niego zamiast duplikować treść
- Cross-account test przechodzi: user B nie widzi/nie zmieni/nie skasuje danych user A; RPC podnosi `not_owner`

Weryfikacja: `psql \d+ weddings tables seats` pokazuje `rowsecurity = true`; `psql \dp` listuje 8 policies + RPC; produkcyjne Supabase dashboard pokazuje te same struktury.

### Key Discoveries:

- `src/lib/supabase.ts:5` — `createClient()` zwraca null gdy env vars puste; każdy caller musi obsłużyć null (S-01 concern, nie F-01)
- `src/middleware.ts:11` — user resolvowany przez `auth.getUser()`, więc `context.locals.user.id` = `auth.uid()` w RLS
- `supabase/config.toml:154` — lokalne `site_url = "http://127.0.0.1:3000"` niezgodne z Astro (4321) — poza scope F-01
- Deployment-plan §0.3 wprost oczekuje F-01 jako trigger do `login`/`link` — Phase 3 tego planu to realizuje
- Migration is one-way (CLAUDE.md) — RLS bug na prodzie = forward-fix migracja, nie rollback
- **RLS testuj tylko jako `authenticated`** — Studio SQL Editor domyślnie łączy jako `postgres` (omija RLS, `auth.uid()`=NULL). Protokół weryfikacji MUSI używać impersonacji usera ("Run as" → authenticated) albo `set local role authenticated` + `request.jwt.claims`; inaczej false-fail. Wzorzec dla S-02/S-03.

## What We're NOT Doing

- `updated_at` na tabelach — brak US/FR wymagającego "last modified"; dodać w migracji gdy realnie potrzeba (analogicznie do `shape`)
- Kolumna `shape` na `tables` — Non-Goals PRD: MVP = round-only
- `guests`, `conflicts`, `assignments` — S-02 i S-03 ownership
- `resize_table` RPC — S-04 own
- Instalacja `zod`, API routes, service files — S-01 pierwszy endpoint
- Automated test runner + integration tests — brak w repo; RLS verification w F-01 manualny (6-step protokół)
- Zmiany w `src/lib/supabase.ts`, `src/middleware.ts`, `src/env.d.ts` — auth flow działa

## Implementation Approach

Jedna migracja tworzy cały fundament. Fazy sekwencyjne: (1) SQL — schema + RPC + RLS w jednym pliku, aplikacja lokalna; (2) typy TS — script + generated + hand-written; (3) verification cross-account + push na prod. Phase 3 to najbardziej external — Phase 1+2 można zamknąć samodzielnie i push zrobić kolejnego dnia, jeśli sesja się kończy.

## Critical Implementation Details

### SECURITY DEFINER + ownership check contract

`create_table_with_seats` używa `SECURITY DEFINER` (funkcja omija RLS na `seats` INSERT, bo działa jako owner). To znaczy funkcja **musi jawnie weryfikować** że `auth.uid()` jest właścicielem `p_wedding_id` **PRZED** insertem — inaczej ktokolwiek zalogowany mógłby seedować wiersze do cudzego wesela. Check musi być pierwszą instrukcją w body:

```sql
if not exists (select 1 from weddings where id = p_wedding_id and user_id = auth.uid()) then
  raise exception 'not_owner' using errcode = '42501';
end if;
```

Ta sama zasada obowiązuje każdą przyszłą `SECURITY DEFINER` funkcję (S-04 `resize_table`, potencjalnie logika assignments). Warto zapisać jako lesson (`/10x-lesson`) w F-01 albo najpóźniej w S-04.

Dodatkowo: `SET search_path = public` w funkcji chroni przed **search_path hijacking** (standard Postgres best practice dla SECURITY DEFINER).

### RLS default deny w Postgres

Gdy RLS jest enabled na tabeli, a dla kombinacji `rola + operacja` **nie ma pasującej policy**, Postgres zwraca 0 wierszy / odrzuca insert. Polegamy na tym dla roli `anon` — nie piszemy dla niej policies. Nie dodawać explicit `TO anon USING (false)` — nic nie chroni czego już nie chroni default deny, tylko zwiększa liczbę linii do maintain.

### USING vs WITH CHECK per operacja

Polityki RLS mają dwie różne klauzule: `USING` filtruje **istniejące** wiersze (SELECT/DELETE — „które mogę zobaczyć/usunąć"), `WITH CHECK` bramkuje **nowe** dane (INSERT/UPDATE — „czy zapis jest dozwolony"). Reguła per operacja:

- **SELECT, DELETE** → tylko `using`
- **INSERT** → tylko `with check` (Postgres **odrzuca** `for insert ... using` błędem `only WITH CHECK expression allowed for INSERT`)
- **UPDATE** → `using` (stary wiersz) + `with check` (nowy wiersz)

Zakres polityk = realne ścieżki dostępu, nie pełna macierz 3×4. Ponieważ RPC (`SECURITY DEFINER`) omija RLS, stoły/miejsca powstają przez `create_table_with_seats` bez udziału polityk INSERT — dlatego `tables` nie dostają polityki INSERT, a `seats` mają wyłącznie SELECT. S-02/S-03 kopiują tę samą zasadę „tyle polityk, ile ścieżek".

### `pgcrypto` dla `gen_random_uuid()`

Supabase zwykle ma `pgcrypto` włączone domyślnie, ale defensywnie migracja powinna wywołać `create extension if not exists pgcrypto` — idempotentne, kosztuje nic, chroni przed edge case (świeży projekt bez rozszerzenia).

Uwaga: od Postgres 13 (config = PG17) `gen_random_uuid()` jest w **rdzeniu** — `pgcrypto` nie jest do tego potrzebne. Guard zostaje wyłącznie defensywnie; można go pominąć bez wpływu na działanie.

---

## Phase 1: Migracja — schema, RLS, RPC

### Overview

Jeden plik SQL tworzy trzy tabele z RLS-em, 8 policies i funkcję RPC. Aplikacja lokalnie przez `npx supabase db reset` weryfikuje czyste zastosowanie na świeżej bazie i poprawność.

### Changes Required:

#### 1. Plik migracji

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_wedding_scope_schema_and_rls.sql` (naming per CLAUDE.md `YYYYMMDDHHmmss_short_description.sql`)

**Intent**: Utworzyć całą warstwę danych F-01 w jednym pliku: extension `pgcrypto`, tabele `weddings`/`tables`/`seats` z FK cascade i CHECK constraints, indeksy na FK dla wydajności RLS-owych subquery, RLS enabled na wszystkich trzech, 8 policies scoped `TO authenticated` z ownership check chain, RPC funkcja `create_table_with_seats` z SECURITY DEFINER + ownership guard + search_path lock, `GRANT EXECUTE` dla `authenticated`. Migracja niesie **tylko krótkie komentarze „dlaczego"** (po angielsku) przy nieoczywistych decyzjach — ownership guard w RPC, brak polityki INSERT na `tables`, default deny dla `anon`, `set search_path` — plus 1-linijkowy wskaźnik do `docs/reference/rls-verification-protocol.md`. Pełnego protokołu weryfikacji NIE wklejamy do pliku (patrz Phase 3.1).

**Contract**:

- **Extension**: `create extension if not exists pgcrypto;`
- **weddings**: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `created_at timestamptz not null default now()`
- **tables**: `id uuid pk default gen_random_uuid()`, `wedding_id uuid not null references weddings(id) on delete cascade`, `name text not null`, `seat_count int not null check (seat_count > 0)`, `created_at timestamptz not null default now()`
- **seats**: `id uuid pk default gen_random_uuid()`, `table_id uuid not null references tables(id) on delete cascade`, `seat_number int not null check (seat_number > 0)`, `created_at timestamptz not null default now()`, `unique (table_id, seat_number)`
- **Indexes**: `create index on tables(wedding_id);`, `create index on seats(table_id);` (FK dla RLS-owych subquery)
- **RLS enable**: `alter table X enable row level security` dla wszystkich 3
- **Policies** (8 razem — tylko realne ścieżki dostępu, każda `TO authenticated`; write na `tables`/`seats` idą przez RPC z pominięciem RLS, patrz sekcja „USING vs WITH CHECK per operacja"):
  - `weddings` (pełne CRUD właściciela — auto-provision INSERT w S-01, rename UPDATE, delete): SELECT/DELETE `using (auth.uid() = user_id)`; INSERT `with check (auth.uid() = user_id)`; UPDATE `using (auth.uid() = user_id)` + `with check (auth.uid() = user_id)`
  - `tables` (SELECT/UPDATE/DELETE bezpośrednio — S-01 lista, S-04 rename+delete; INSERT wyłącznie przez `create_table_with_seats` → **brak polityki INSERT**): owner-chain `exists (select 1 from weddings w where w.id = wedding_id and w.user_id = auth.uid())` — SELECT/DELETE w `using`, UPDATE w `using` + `with check`
  - `seats` (**tylko SELECT** — miejsca powstają/znikają wyłącznie przez RPC + FK cascade): SELECT `using (exists (select 1 from tables t join weddings w on w.id = t.wedding_id where t.id = table_id and w.user_id = auth.uid()))`
- **RPC** (non-obvious — inne RPCs pójdą tym wzorcem, snippet poniżej):

```sql
create or replace function public.create_table_with_seats(
  p_wedding_id uuid,
  p_name text,
  p_seat_count int
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_table_id uuid;
begin
  if p_seat_count <= 0 then
    raise exception 'seat_count_must_be_positive' using errcode = '22023';
  end if;

  if not exists (
    select 1 from weddings where id = p_wedding_id and user_id = auth.uid()
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  insert into tables (wedding_id, name, seat_count)
    values (p_wedding_id, p_name, p_seat_count)
    returning id into v_table_id;

  insert into seats (table_id, seat_number)
    select v_table_id, generate_series(1, p_seat_count);

  return v_table_id;
end $$;

grant execute on function public.create_table_with_seats(uuid, text, int) to authenticated;
```

- **Inline comments** (English, terse): krótkie `--` komentarze *dlaczego* wyłącznie przy nieoczywistych decyzjach — ownership guard w RPC (SECURITY DEFINER omija RLS), brak polityki INSERT na `tables` (write idzie przez RPC), default deny dla `anon`, `set search_path`. **Bez pełnego protokołu** — jedna linijka wskaźnika: `-- RLS cross-account verification: see docs/reference/rls-verification-protocol.md`

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` kończy się bez błędów (migracja aplikuje się czysto na świeżej bazie)
- `npx supabase db diff --local` po `db reset` zwraca "no differences" (schema stan zgodny z migracją)
- Query `select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('weddings','tables','seats')` zwraca 3 wiersze z `rowsecurity = true`

#### Manual Verification:

- Lokalne Studio (http://127.0.0.1:54323) pokazuje `weddings`, `tables`, `seats` w schema `public`
- Studio → Database → Functions listuje `create_table_with_seats(uuid, text, int)`
- Utworzone dwa test-users (A, B) via Inbucket magic link (`http://127.0.0.1:54324`)
- **Kroki A poniżej uruchamiane jako rola `authenticated` z impersonacją usera** (SQL Editor → "Run as" → authenticated + user A; fallback: `set local role authenticated` + `set local request.jwt.claims`). W domyślnym trybie `postgres` RLS jest omijane i `auth.uid()` = NULL → testy dają false-fail.
- Jako user A (impersonacja A): manual insert weselnego wiersza `insert into weddings(user_id, name) values (auth.uid(), 'Test A')` — sukces
- Jako user A (impersonacja A): `select create_table_with_seats('<wedding-uuid>', 'Stół główny', 10)` — zwraca uuid, `select count(*) from seats where table_id = '<returned-uuid>'` = 10

**Implementation Note**: Po zaliczeniu 1.4–1.8 zatrzymaj się na potwierdzenie manualne przed Phase 2.

---

## Phase 2: TypeScript types integration

### Overview

Wpiąć `supabase gen types typescript` jako źródło prawdy row-types; wyeksponować domain aliasy w `src/types.ts` do reszty appki. Wyłączyć generowany plik typów spod strict ESLint (bez tego `prebuild` lint kończy się błędem na 134 naruszeniach reguł). Udokumentować workflow "regeneracja po migracji" w CLAUDE.md.

### Changes Required:

#### 1. npm script

**File**: `package.json`

**Intent**: Dodać `db:types` skrypt — jedna komenda regeneruje typy po każdej migracji.

**Contract**: W sekcji `scripts`: `"db:types": "supabase gen types typescript --local > src/db/database.types.ts"`.

#### 2. Generated types file

**File**: `src/db/database.types.ts` (nowy plik + nowy katalog `src/db/`)

**Intent**: Automatycznie generowany przez `npm run db:types` bezpośrednio po zakończeniu Phase 1. **Nie edytować ręcznie.** Trzymany w gicie (jak `package-lock.json`) żeby CI/Cloudflare Workers Builds mogło zbudować bez odpalania Supabase CLI.

**Contract**: Wynik `supabase gen types typescript --local` — zawiera `Database.public.Tables.weddings/tables/seats` z wariantami `Row`, `Insert`, `Update` oraz sygnaturę `Database.public.Functions.create_table_with_seats` z parametrami i return type.

#### 3. ESLint ignore dla generowanego pliku typów

**File**: `eslint.config.js`

**Intent**: Wyłączyć `src/db/database.types.ts` spod strict ESLint. Repo lintuje przez `includeIgnoreFile(.gitignore)` + `strictTypeChecked`/`stylisticTypeChecked`, a generowany plik Supabase narusza 134 reguły (prettier + `@typescript-eslint/no-redundant-type-constituents`, ta ostatnia nie jest `--fix`-owalna). Bez ignore `prebuild` (`astro sync && npm run lint`) kończy się błędem, a Cloudflare Workers Builds odtwarza ten sam błąd na CI. Ignore to standardowe podejście dla kodu generowanego — plik pozostaje 1:1 z outputem `db:types`, przeżywa regenerację i jest pomijany także przez `eslint --fix` w pre-commit hooku (lint-staged), więc commit nie zgłasza błędu na tym pliku.

**Contract**: Dodać standalone global-ignores object do `tseslint.config(...)` w `eslint.config.js`, tuż po `includeIgnoreFile(gitignorePath)`:

```js
{ ignores: ["src/db/database.types.ts"] },
```

Precyzyjnie jeden plik (nie cały katalog `src/db/`) — ręcznie pisane helpery dodane później do `src/db/` mają pozostać linterowane. Przyszłe slice'y (S-02/S-03) regenerujące ten sam plik korzystają z tego samego wpisu bez zmian (ścieżka stała — zawsze `database.types.ts`).

#### 4. Domain type aliases

**File**: `src/types.ts` (nowy — pierwszy raz zakładany, per CLAUDE.md convention)

**Intent**: Centralne miejsce dla shared entity types. F-01 seeduje trzy re-eksporty; przyszłe slice'y (S-01+) dodają tu DTO (form inputs, composite responses).

**Contract**:

```ts
import type { Database } from "@/db/database.types";

export type Wedding = Database["public"]["Tables"]["weddings"]["Row"];
export type Table = Database["public"]["Tables"]["tables"]["Row"];
export type Seat = Database["public"]["Tables"]["seats"]["Row"];

// Future slices: dopisuj tutaj DTO (CreateTableInput, WeddingWithTables composite, itp.)
```

#### 5. CLAUDE.md — regeneration workflow

**File**: `CLAUDE.md`

**Intent**: Udokumentować że migracje wymagają `npm run db:types` przed commitem — bez tego typy dryfują od schemy i Cloudflare Workers Builds złapie błąd w prebuild-lint dopiero na CI.

**Contract**: Dopisać do bullet "Supabase migrations" w §Key conventions: "After each migration, run `npm run db:types` and commit `src/db/database.types.ts` alongside the migration — the file is generated, don't hand-edit."

### Success Criteria:

#### Automated Verification:

- `npm run db:types` kończy się bez błędów
- `src/db/database.types.ts` istnieje i zawiera 3 tabele + `create_table_with_seats` w `Functions`
- `eslint.config.js` zawiera ignore dla `src/db/database.types.ts`; `npm run lint` przechodzi bez błędów z tego pliku (bez ignore — 134 naruszenia strict-lint)
- `npm run build` przechodzi (odpala `astro sync` + `npm run lint` + `astro build`; weryfikuje że typy się kompilują z resztą kodu)

#### Manual Verification:

- Otwarcie `src/types.ts` w IDE — importy z `@/db/database.types` działają, brak błędów TypeScript
- Scratch file `import type { Wedding } from "@/types"; const w: Wedding = ...` — autocomplete pokazuje pola `id`, `user_id`, `name`, `created_at`
- `src/db/database.types.ts` zacommitowany razem z migracją (plik generowany trzymany w gicie, jak `package-lock.json`)

**Implementation Note**: Phase 2 jest szybka; jeśli Phase 3 pushu na prod odkładasz, można ją zamknąć razem z Phase 1.

---

## Phase 3: RLS verification + production push

### Overview

Manualny 6-krokowy test cross-account udowadnia RLS isolation lokalnie. Potem realizacja odłożonej Phase 0.3 z deployment-plan (`supabase login` + `link`) i push migracji na produkcję.

### Changes Required:

#### 1. RLS cross-account verification protocol (współdzielony doc + wykonanie)

**File**: `docs/reference/rls-verification-protocol.md` (nowy — trwały doc referencyjny)

**Intent**: Utworzyć trwały dokument referencyjny z 6-krokowym protokołem, potem wykonać go lokalnie. **Jedno źródło prawdy** — migracje (F-01 + przyszłe S-02, S-03) linkują do niego zamiast wklejać treść. Doc żyje poza `context/changes/`, więc przeżywa archiwizację planu i pozostaje discoverable.

**Contract**: Markdown doc (zwykły markdown, bez `-- ` prefiksów). Nagłówek + ostrzeżenie o roli + prep + kroki user A / user B:

```markdown
# RLS cross-account verification protocol

Współdzielony runbook weryfikacji izolacji RLS. Linkowany z każdej migracji z RLS
(F-01 `weddings`/`tables`/`seats`, S-02 guests+conflicts, S-03 assignments).

> **Uruchamiać jako rola `authenticated`, NIE jako domyślny `postgres`.** W trybie
> postgres RLS jest omijane, a `auth.uid()` = NULL → kroki 3–5 zwracają wszystkie
> wiersze (false-fail). W Studio SQL Editorze: „Run as" → authenticated + wybór usera.
> Fallback (starsze Studio): owiń kroki każdego usera w transakcję z
> `set local role authenticated;` +
> `set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';`

**Prep:** utwórz dwóch test-users A i B przez Studio Auth (magic link → Inbucket http://127.0.0.1:54324).

**Jako user A** (impersonacja A → `auth.uid()` = uuid_A):
1. `insert into weddings (user_id, name) values (auth.uid(), 'A wedding') returning id;` → zwraca `uuid_W_A`
2. `select create_table_with_seats(uuid_W_A, 'A table', 10);` → zwraca `uuid_T`; `select count(*) from seats where table_id = uuid_T` → 10

**Jako user B** (przełącz impersonację na B):
3. `select * from weddings where id = uuid_W_A;` → MUSI zwrócić 0 wierszy (RLS blokuje SELECT)
4. `update weddings set name = 'hacked' where id = uuid_W_A;` → MUSI affect 0 wierszy (RLS blokuje UPDATE)
5. `delete from weddings where id = uuid_W_A;` → MUSI affect 0 wierszy (RLS blokuje DELETE)
6. `select create_table_with_seats(uuid_W_A, 'B hack', 5);` → MUSI raise `not_owner` (RPC ownership check)
```

Migracja niesie tylko wskaźnik: `-- RLS cross-account verification: see docs/reference/rls-verification-protocol.md`

#### 2. Production sync (external ops — nie kod)

**File**: `context/changes/deployment/deployment-plan.md` (edycja checkboxów §0.3)

**Intent**: Zrealizować `supabase login` + `link` (deferred Phase 0.3 deployment-plan), wypchnąć migrację na prod, przełączyć checkboxy w deployment-plan z `[~]` (deferred) na `[x]` (done).

**Contract**:

- Terminal: `npx supabase login` (interactive OAuth w przeglądarce)
- Terminal: `npx supabase link --project-ref <ref-z-password-managera>`
- Terminal: `npx supabase db push` (aplikuje migrację F-01 na prod)
- Weryfikacja: `npx supabase db diff --linked` → "no differences"
- Edit `context/changes/deployment/deployment-plan.md` — flipnij **wszystkie** `[~]` związane z §0.3 z `[~]` na `[x]` i usuń adnotacje "*deferred*": dwa w body §0.3 (`supabase login`, `supabase link`) **oraz** acceptance checkbox w §0.4 pre-flight (`npx supabase link … succeeded`, ~linia 174, oznaczony "deferred with Phase 0.3 until first migration")

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` kończy się bez błędów
- `npx supabase db diff --linked` zwraca "no schema differences"

#### Manual Verification:

- 6 kroków protokołu (Phase 3.1) przechodzi lokalnie w Studio
- Produkcyjny Supabase dashboard → Table Editor pokazuje `weddings`, `tables`, `seats` z badge "RLS Enabled"
- Produkcyjny dashboard → Database → Functions listuje `create_table_with_seats`
- Produkcyjny dashboard → Authentication → Policies pokazuje 8 policies (weddings ×4, tables ×3, seats ×1)
- `context/changes/deployment/deployment-plan.md` zaktualizowany — wszystkie §0.3-related `[~]` → `[x]` (2 w §0.3 body + 1 acceptance w §0.4, ~linia 174)

**Implementation Note**: Phase 3 jest external-heavy — jeśli produkcyjny projekt Supabase nie jest jeszcze gotowy (albo user chce push zrobić w innym oknie czasowym), zatrzymaj się po 3.1 (manualnym teście lokalnym) i zamknij Phase 3.2 kolejną sesją.

---

## Testing Strategy

### Unit Tests:

- Test runner nie istnieje w repo (`README` mówi wprost) — F-01 nie zakłada runnera. Gdy zostanie wpięty post-S-01, dopisać:
  - Integration test z lokalnym Supabase: utwórz user A, wywołaj RPC, assert `seats.count = seat_count`
  - Integration test negative-path: authenticate as user B, atempt RPC na A's wedding, assert error `not_owner`

### Integration Tests:

- Manualne dla F-01 (Phase 3.1 documented protocol)
- Acceptance: wszystkie 6 kroków przechodzi

### Manual Testing Steps:

Rozpisane w Phase 1 (Success Criteria — Manual) i Phase 3.1 (6-step protocol). Kluczowe cztery testy:

1. **Happy path RPC** — user A tworzy wesele + stół, `seats.count = seat_count`
2. **Cross-account SELECT** — user B nie widzi wesela user A
3. **Cross-account WRITE** — user B nie zmieni/nie usunie wesela user A
4. **RPC ownership bypass attempt** — user B próbuje RPC z uuid wesela user A → `not_owner`

## Performance Considerations

- `data_volume: small` per PRD → maks. ~150 gości × 1-2 wesela → schema irrelevantnie mała
- RPC używa `generate_series(1, N)` — O(N), N ≤ 20 seats/stół, trivial
- Indeksy: PK-i auto, FK-owe `tables(wedding_id)` i `seats(table_id)` explicit w migracji — RLS subquery używa tych FK, brak indeksu = seq scan przy każdej policy evaluation

## Migration Notes

**To jest pierwsza migracja repo.** Ustala:

- Naming convention (`YYYYMMDDHHmmss_short_description.sql`, per CLAUDE.md)
- RLS pattern (`TO authenticated` + owner-chain USING, brak `TO anon`)
- RPC-for-atomic-cross-table-operations pattern (SECURITY DEFINER + explicit ownership check + `set search_path`)
- Types generation workflow (`npm run db:types` po każdej migracji, commit razem z SQL)
- Verification protocol pattern (6-step cross-account w `docs/reference/rls-verification-protocol.md`, linkowany z migracji)

S-02 i S-03 kopiują wszystkie 5 wzorców. Migracja jest one-way (CLAUDE.md); rollback strategy = forward-fix migration. Dla F-01 ryzyko konkretne to RLS policy misconfiguration → weryfikacja w Phase 3 **PRZED** push na prod.

## References

- Roadmap item: `context/foundation/roadmap.md` §F-01
- PRD refs: NFR "Prywatność danych", NFR "Trwałość stanu planu", Guardrail "Invariant przypisań", FR-019, `## Access Control`
- Deployment plan §0.3 (unblocked by Phase 3.2): `context/changes/deployment/deployment-plan.md`
- CLAUDE.md conventions: §Key conventions (Supabase migrations, RLS, path alias)
- Existing auth wiring: `src/lib/supabase.ts:5`, `src/middleware.ts:11`, `src/env.d.ts:3`
- Downstream pattern reuse: S-02 `guest-and-conflict-management`, S-03 `assignment-with-realtime-conflict-validation`, S-04 `table-edit-with-guest-auto-unassign` (drugie RPC `resize_table`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Migracja — schema, RLS, RPC

> Done — commit `41cddc4` on branch `feat/wedding-scope-schema-and-rls` (1.1–1.8).

#### Automated

- [x] 1.1 `npx supabase db reset` kończy się bez błędów
- [x] 1.2 `npx supabase db diff --local` po `db reset` zwraca "no differences"
- [x] 1.3 `pg_tables` query potwierdza `rowsecurity = true` na wszystkich 3 tabelach

#### Manual

- [x] 1.4 Studio pokazuje `weddings`, `tables`, `seats` w schema `public`
- [x] 1.5 Studio → Functions listuje `create_table_with_seats(uuid, text, int)`
- [x] 1.6 Dwóch test-users utworzonych (A, B) via Inbucket magic link
- [x] 1.7 Jako user A: manual INSERT weselnego wiersza — sukces
- [x] 1.8 Jako user A: RPC `create_table_with_seats(...)` zwraca uuid, 10 seats istnieje

### Phase 2: TypeScript types integration

#### Automated

- [x] 2.1 `npm run db:types` kończy się bez błędów
- [x] 2.2 `src/db/database.types.ts` istnieje z 3 tabelami + RPC signature
- [x] 2.3 `eslint.config.js` ma ignore dla `src/db/database.types.ts`; `npm run lint` przechodzi bez błędów z tego pliku
- [x] 2.4 `npm run build` przechodzi

#### Manual

- [x] 2.5 Autocomplete na `Wedding` z `@/types` pokazuje wszystkie 4 pola
- [x] 2.6 `src/db/database.types.ts` w gicie (commit razem z migracją)
- [x] 2.7 Importy w `src/types.ts` z `@/db/database.types` działają — brak błędów TypeScript

### Phase 3: RLS verification + production push

#### Automated

- [ ] 3.1 `npx supabase db push` kończy się bez błędów
- [ ] 3.2 `npx supabase db diff --linked` zwraca "no differences"

#### Manual

- [ ] 3.3 `docs/reference/rls-verification-protocol.md` utworzony; 6 kroków protokołu przechodzi lokalnie (Phase 3.1)
- [ ] 3.4 Produkcyjny dashboard → Table Editor: `weddings`/`tables`/`seats` z badge "RLS Enabled"
- [ ] 3.5 Produkcyjny dashboard → Database → Functions listuje `create_table_with_seats`
- [ ] 3.6 Produkcyjny dashboard → Authentication → Policies: 8 policies (weddings ×4, tables ×3, seats ×1)
- [ ] 3.7 `context/changes/deployment/deployment-plan.md` — wszystkie §0.3-related `[~]` → `[x]` (2 w §0.3 body + 1 w §0.4 ~linia 174)
