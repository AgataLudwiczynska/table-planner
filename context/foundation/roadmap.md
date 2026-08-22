---
project: TablePlanner
version: 1
status: draft
created: 2026-08-09
updated: 2026-08-22
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: TablePlanner

> **Tracked in Linear:** https://linear.app/agata-l/project/tableplanner-mvp-71b34673c10a
>
> Wyprowadzone z `context/foundation/prd.md` (v1) + auto-zbadany baseline codebase'u.
> Edit-in-place; archiwizuj przy superseded.
> Slice'y są uporządkowane po zależnościach. Tabela „At a glance" to indeks.

## Vision recap

TablePlanner to walidator sąsiedztw miejsc przy okrągłych stołach weselnych — pojedynczy operator pary młodej wpisuje 100–150 gości, definiuje pary konfliktowe („nie obok siebie"), przypisuje gości do konkretnych miejsc i natychmiast (bez przycisku „Sprawdź") widzi flagowanie naruszeń dla par siedzących obok siebie. Odróżnia się od konkurencji (Allseated i podobne) tym, że nie modeluje sali z meblami, tylko relację pierścienia sąsiedztw przy stole — miejsce N sąsiaduje z N−1 i N+1 modulo liczba miejsc. Sekwencja poniżej gonimy pod twardy deadline 2026-09-10 (`main_goal: speed`) i po jednoosobowym after-hours (`top_blocker: capacity`).

## North star

**S-03: Operator widzi konflikt sąsiedztwa w czasie rzeczywistym po przypisaniu** — pierwszy end-to-end moment dowodzący hipotezy produktu (real-time walidator ma sens tylko wtedy, gdy działa natychmiast na realnych danych).

> „Gwiazda przewodnia" (dalej north star) to najmniejszy end-to-end slice, którego dostarczenie dowodzi rdzennej hipotezy produktu — reszta ma znaczenie tylko jeśli ten slice zadziała. Umieszczamy ją tak wcześnie, jak Prerequisites pozwalają.

## At a glance

| ID    | Change ID                                       | Outcome (operator może …)                                                                    | Prerequisites | PRD refs                                                       | Status   |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- | -------- |
| F-01  | `wedding-scope-schema-and-rls`                  | (foundation) schema `weddings+tables+seats` + wzorzec RLS per-operation dla owner-only       | —             | NFR Prywatność, NFR Trwałość, Guardrail Invariant              | done |
| S-01  | `wedding-shell-with-tables`                     | zalogować się, mieć wesele z nazwą, dodać okrągły stół z auto-generowanymi miejscami         | F-01          | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007         | done |
| S-02  | `guest-and-conflict-management`                 | dodać, edytować, usunąć gościa; zdefiniować i usunąć binarny konflikt między parą gości      | F-01, S-01    | FR-010, FR-011, FR-012, FR-014, FR-015, FR-016                 | done |
| S-03  | `assignment-with-realtime-conflict-validation`  | przypisać gościa (drag/click), zobaczyć graficzny okrąg i natychmiast czerwone flagowanie    | S-01, S-02    | US-01, FR-013, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023 | in-progress |
| S-04  | `table-edit-with-guest-auto-unassign`           | zmienić liczbę miejsc lub usunąć stół z dialogiem potwierdzenia i atomowym auto-unassign     | S-03          | US-02, FR-008, FR-009                                          | proposed |
| S-05  | `assignment-progress-and-persistence`           | widzieć licznik „N/M gości przypisanych" i wrócić do dokładnie tego samego stanu po logout   | S-03          | US-03, FR-024                                                  | proposed |

## Streams

Pomocnicza nawigacja — grupuje pozycje po łańcuchach Prerequisites. Kanoniczna kolejność żyje w tabeli „At a glance" wyżej.

| Stream | Motyw                           | Chain                                                | Notka                                                                         |
| ------ | ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| A      | Setup + gwiazda + rozwój danych | `F-01` → `S-01` → `S-02` → `S-03` → `S-04` / `S-05` | Jedyna oś, sekwencyjna. S-02 realnie startuje dopiero po S-01 (nadbudowuje nad weselem + stroną wesela), więc mimo niezależnego schematu leży w tej samej osi, nie jako osobny tor. S-04 i S-05 rozdzielają się w parze po S-03 (agent-fan-out). |

## Baseline

Co jest już w codebase'ie na dziś 2026-08-09 (auto-researched + potwierdzone przez użytkownika).
Foundations poniżej zakładają, że te warstwy działają, i NIE ich nie re-scaffolduje.

- **Frontend:** PRESENT — Astro 6 + React 19 + Tailwind 4 + shadcn/ui (`src/components/ui/`); tylko `index.astro` + `dashboard.astro` + auth pages, zero powierzchni domenowej.
- **Backend / API:** PARTIAL — 3 endpointy `/api/auth/*.ts`; `zod` nieobecny w `package.json` mimo deklaracji w `tech-stack.md` (do dodania w S-01 przy pierwszym endpoincie domenowym); brak serwisów domenowych.
- **Data:** PARTIAL — Supabase local zainicjalizowany (`supabase/config.toml`), client SSR wpięty w `src/lib/supabase.ts`, ZERO migracji — schema wesele/stoły/goście/konflikty/przypisania do zbudowania (patrz F-01 i migracje własne slice'ów).
- **Auth:** PRESENT — Supabase email/hasło, `src/middleware.ts` z `PROTECTED_ROUTES=["/dashboard"]`, `confirm-email.astro`. Reset hasła nie istnieje i nie jest brakiem — jest jawnym Non-Goal.
- **Deploy / infra:** PRESENT — `wrangler.jsonc` + `@astrojs/cloudflare` adapter, Cloudflare Workers Builds (deploy on push-to-main); `.github/workflows/` puste, nie jest potrzebne.
- **Observability:** ABSENT (poza platform-level) — brak logger'a, error trackera, code-level metryk. `wrangler.jsonc` ma `observability.enabled: true` (Cloudflare dashboard) — dla MVP wystarczy, NFR nie wymaga więcej.

## Foundations

### F-01: Schema wedding-scope + wzorzec RLS

- **Outcome:** (foundation) Baseline schema `weddings` (własność użytkownika via `user_id`), `tables` (FK do wesela), `seats` (auto-generowane 1..N per stół) w Supabase; polityki RLS per-operation (SELECT/INSERT/UPDATE/DELETE, per-role) ograniczające każdą operację do właściciela wesela; typy TS wygenerowane. Ustala wzorzec RLS naśladowany przez migracje wnoszone przez S-02 (`guests+conflicts`) i S-03 (`assignments`).
- **Change ID:** `wedding-scope-schema-and-rls`
- **PRD refs:** NFR „Prywatność danych", NFR „Trwałość stanu planu", Guardrail „Invariant przypisań", FR-019, Access Control
- **Unlocks:** S-01 (bezpośrednio); wzorzec migracji + RLS wielokrotnego użytku dla S-02 i S-03; verification path „RLS niezależny read przez inny konto zwraca 0 wierszy" powielany w każdym slice'ie
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy `seats` modelujemy jako osobną tabelę z rekordem na każde miejsce (z FK do `tables` i unique constraint na `(table_id, seat_number)`), czy trzymamy tylko `tables.seat_count` i seat_number pochodzi z indeksu w listingu assignments? — Owner: impl. Block: no. (Wskazanie: osobna tabela `seats` upraszcza modelowanie `assignments (guest_id, seat_id)` i egzekwuje invariant na poziomie DB via unique constraint.)
- **Risk:** Pierwsza migracja z RLS ustala wzorzec dla wszystkich kolejnych — błąd w polityce = potencjalny wyciek danych innego użytkownika, co narusza guardrail „Prywatność danych" z PRD. Foundation sekwencjonowana przed jakąkolwiek pracą user-facing, żeby polityki dostać dedykowany review, zanim pattern powieli się w S-02 i S-03. Backup weryfikacyjny: manual test loguję jako user A, insertuję wesele; loguję jako user B; próbuję SELECT/UPDATE/DELETE po ID wesela A — musi zwrócić 0 lub 403.
- **Status:** done

## Slices

### S-01: Operator zakłada wesele i dodaje pierwszy okrągły stół

- **Outcome:** Operator loguje się istniejącym flow (Supabase email/hasło), ma dostęp do wesela z domyślną nazwą (auto-provisioning przy pierwszej wizycie po loginie), może zmienić nazwę wesela, dodać stół okrągły z liczbą miejsc i zobaczyć listę pustych stołów.
- **Change ID:** `wedding-shell-with-tables`
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
- **Prerequisites:** F-01
- **Parallel with:** — (wcześniej S-02; przeniesione do sekwencji po S-01)
- **Blockers:** —
- **Unknowns:**
  - Czy MVP zakłada jedno wesele per użytkownik (auto-provision + rename) czy jawne „create wedding" z listą wielu wesel? — Owner: user. Block: no. (Wskazanie: auto-provision + rename — `target_scale.users: small` zniechęca do dodatkowego UX; łatwo rozszerzyć w v2 jeśli user zażyczy.) **Rozstrzygnięte w planie: auto-provision + rename.**
- **Risk:** Slice ustala pierwsze pełne API pattern dla domeny (endpoint format, walidacja `zod`, kształt błędu, `PROTECTED_ROUTES`) — każdy kolejny slice powiela wzorzec, więc warto zrobić raz porządnie. Ryzyko: zbytnie ambicje pierwszego API (np. cache, batching) zjadają margines — trzymamy się minimum, iteracja w kolejnych slice'ach. S-02 dzieli z S-01 tę samą foundation (F-01), ale realnie rusza dopiero po S-01 (patrz S-02 Prerequisites) — nie jest to równoległy tor.
- **Status:** done

### S-02: Operator dodaje gości i definiuje konflikty

- **Outcome:** Operator może dodać gościa (imię, nazwisko, opcjonalnie strona: panna młoda / pan młody / wspólne / nieokreślone, opcjonalnie grupa: rodzina / przyjaciele / współpracownicy), edytować i usunąć gościa. Może zdefiniować binarny konflikt między parą gości („nie obok siebie"), usunąć konflikt, zobaczyć listę wszystkich zdefiniowanych konfliktów. Bez tier'ów severity.
- **Change ID:** `guest-and-conflict-management`
- **PRD refs:** FR-010, FR-011, FR-012, FR-014, FR-015, FR-016
- **Prerequisites:** F-01, S-01. Schemat `guests`/`conflicts` zależy tylko od F-01, ale S-02 nadbudowuje nad S-01 w runtime: dodanie gościa wymaga rekordu `wedding` (auto-provisioning z S-01), a UI gości/konfliktów żyje na stronie wesela z S-01. Implementację i test end-to-end odpala się po merge S-01 — nie planować `plan.md` S-02 przed merge S-01 (wniosek 2026-08-15).
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** CRUD-w-CRUD bez większych niewiadomych — najbezpieczniejszy, najniższego ryzyka slice w sekwencji. Ryzyko subtelne: modelowanie konfliktu jako `(guest_a_id, guest_b_id)` wymaga canonical order (mniejszy ID first) żeby uniknąć duplikatów par (A,B) i (B,A); niezauważenie tego przy insertach = bug w liczeniu naruszeń w S-03. Dodać unique constraint na uporządkowanej parze w migracji.
- **Status:** done

### S-03: Operator widzi konflikt sąsiedztwa w czasie rzeczywistym po przypisaniu

**← Gwiazda przewodnia (north star).**

- **Outcome:** Operator widzi zawsze-widoczny panel nieprzypisanych gości obok widoku stołów. Może przypisać gościa do konkretnego miejsca przez drag-and-drop LUB klik-fallback (klik gościa → klik miejsca). Widzi każdy stół jako graficzny okrąg z miejscami numerowanymi 1..N i przypisanymi imionami. Po każdej zmianie przypisania (drag release lub klik commit) system natychmiast, bez przycisku „Sprawdź": (a) podświetla na czerwono oba miejsca naruszające konflikt sąsiedztwa (pierścień: N sąsiaduje z N−1 i N+1 modulo liczba miejsc) + dodaje ikonę ostrzeżenia, (b) dodaje pozycję na liście naruszonych konfliktów w widoku podsumowania. Operator może zwolnić gościa z miejsca (z powrotem do panelu nieprzypisanych). Invariant: max 1 gość / miejsce, max 1 miejsce / gość — egzekwowany na poziomie DB (F-01) i UI. System NIE auto-odwiązuje gości przy wykryciu konfliktu — operator decyduje.
- **Change ID:** `assignment-with-realtime-conflict-validation`
- **PRD refs:** US-01, FR-013, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy walidacja sąsiedztwa liczona jest po stronie klienta (React state, natychmiast po drag release) czy serwera (przy każdym POST /assignments)? — Owner: impl. Block: no. (Wskazanie: klient dla natychmiastowości UX; serwer waliduje idempotentnie przy commicie assignmentu jako guardrail, ale UI reaguje przed round-tripem — obie warstwy muszą się zgadzać.)
  - Konkretny target wydajnościowy dla walidacji (np. p95 < 200 ms dla 150 gości i N konfliktów) — PRD Open Question #1. — Owner: downstream (impl / wybór algorytmu). Block: no. (Wskazanie: inkrementalna re-walidacja tylko zmienionych miejsc + ich sąsiadów; pełne re-check tylko przy zmianie topologii stołu.)
- **Risk:** Slice o największej powierzchni — real-time UX (drag-and-drop + click), geometria pierścienia (modulo edge case dla stołu z 2 miejscami), graficzny okrąg SVG i inkrementalna walidacja jednocześnie. Przekroczenie budżetu tego slice zjada margines na S-04/S-05. Mitygacja pod `speed`: dostarczyć najpierw walidację + highlight na płaskiej liście miejsc (numery bez okręgu), potem graficzny okrąg jako iterację w tym samym slice — obie części zostają w scope. Guardrail „walidacja nigdy nie milczy" (FR-021, false negatives = 0) traktujemy jako acceptance criterion — jeśli test integracyjny wykryje missed adjacency, slice nie jest done.
- **Status:** in-progress

### S-04: Operator edytuje stół — zmniejsza liczbę miejsc lub usuwa

- **Outcome:** Operator może zmienić nazwę stołu i liczbę miejsc; jeśli nowa liczba miejsc jest mniejsza niż liczba obecnie przypisanych gości, system pokazuje dialog „Zmniejszenie zwolni miejsca dla N gości — kontynuować?" z opcjami „Anuluj" / „Zwolnij i zmień"; po zatwierdzeniu operacja jest atomowa (stół zmienia rozmiar + goście z najwyższych zwalnianych miejsc wracają do panelu nieprzypisanych + powiązane naruszenia konfliktów znikają). Operator może usunąć stół (z potwierdzeniem; unassign wszystkich jego gości).
- **Change ID:** `table-edit-with-guest-auto-unassign`
- **PRD refs:** US-02, FR-008, FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Atomowość operacji (zmiana `seat_count` + unassign gości z zwalnianych miejsc + rekalkulacja naruszeń konfliktów) w jednej transakcji vs. wielu żądaniach — łatwo o niespójny stan przy błędzie sieci lub gońcu klienta. Mitygacja: cała operacja jako pojedynczy endpoint / Postgres function z transakcją, klient dostaje tylko wynik atomowy. Test acceptance: sekwencja „zmniejsz z 10 do 5 przy 7 przypisanych → potwierdź → zweryfikuj stan wesela w DB" — dokładnie 5 miejsc, 2 gości wolnych, 0 powiązanych naruszeń.
- **Status:** proposed

### S-05: Operator śledzi postęp i wraca do stanu po wylogowaniu

- **Outcome:** Operator widzi w stałym miejscu interfejsu (nagłówek lub sidebar panelu nieprzypisanych) licznik „N / M gości przypisanych" aktualizowany po każdym przypisaniu, gdzie M to suma miejsc we wszystkich stołach a N to liczba przypisanych gości. Postęp jest niezależny od poprawności walidacji — 150/150 pokazuje się nawet gdy są naruszenia konfliktów (lista naruszeń rośnie osobno). Po wylogowaniu i ponownym zalogowaniu operator widzi dokładnie ten sam stan: wszyscy przypisani goście na tych samych miejscach, wszystkie zdefiniowane konflikty, wszystkie stoły bez zmian.
- **Change ID:** `assignment-progress-and-persistence`
- **PRD refs:** US-03, FR-024
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Persystencja jest własnością F-01 (wszystko w Postgresie z RLS) więc słabe ryzyko techniczne — slice głównie weryfikacyjny + drobne UI (licznik). Ryzyko produktowe: brak explicit testu logout/login w acceptance criteria = możliwość pominięcia sprawdzenia że pełny stan wesela (nie tylko przypisania, ale też stoły i konflikty) się utrzymuje. Mitygacja: acceptance criterion explicit „logout, login, weryfikuj: N przypisanych = N przed logout, K konfliktów = K, wszystkie stoły identyczne".
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                                        | Suggested issue title                                                            | Ready for `/10x-plan` | Notes                                            |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| F-01       | `wedding-scope-schema-and-rls`                   | Foundation: schema wedding-scope + wzorzec RLS                                    | —                     | Done (archived 2026-08-14) → patrz sekcja Done   |
| S-01       | `wedding-shell-with-tables`                      | Operator zakłada wesele i dodaje pierwszy okrągły stół                            | yes                   | F-01 done; zaplanowane (osobny branch)            |
| S-02       | `guest-and-conflict-management`                  | Operator dodaje gości i definiuje konflikty                                       | no                    | czeka na S-01 done (runtime); patrz S-02 Prerequisites |
| S-03       | `assignment-with-realtime-conflict-validation`   | GWIAZDA: Przypisanie + real-time walidacja konfliktów sąsiedztwa                   | no                    | czeka na S-01 i S-02 done                         |
| S-04       | `table-edit-with-guest-auto-unassign`            | Edycja stołu — zmniejszanie z auto-unassign i usunięcie                            | no                    | czeka na S-03 done; równolegle z S-05             |
| S-05       | `assignment-progress-and-persistence`            | Licznik postępu + weryfikacja persystencji stanu po logout                        | no                    | czeka na S-03 done; równolegle z S-04             |

## Open Roadmap Questions

1. **Czy w v1 włączamy weryfikację e-mail (FR-004a, should-have)?** PRD Open Question #2. Zależne od (a) wybranego dostawcy SMTP i jego limitów na darmowym planie oraz (b) czasu na obsługę „mail nie dotarł". — Owner: user. Block: — (nie gate'uje żadnego slice; konfiguracja Supabase, nie kod). Do decyzji przed zaproszeniem pierwszego realnego użytkownika (poza kontami deweloperskimi).
2. **Konkretny target wydajnościowy dla walidacji (np. p95 < 200 ms dla 150 gości i N konfliktów).** PRD Open Question #1. FR-021 ustalił „bezwarunkową natychmiastowość" jako zasadę produktu, ale nie nazwał liczby. — Owner: downstream (faza implementacji / wybór algorytmu). Block: — (należy do S-03 jako impl-level Unknown; nie gate'uje planowania roadmap).

## Parked

Zebrane z PRD `## Non-Goals` — świadome cięcia MVP z ich uzasadnieniem.

- **Algorytm sugestii rozmieszczenia (auto-sit).** Zachowanie kontroli operatora + uniknięcie czarnej skrzynki sugerującej „niewłaściwe" sąsiedztwa.
- **Wizualny plan sali (rozkład mebli w przestrzeni).** TablePlanner to walidator sąsiedztw, nie planer sali — inna kategoria narzędzi.
- **Drag-and-drop bezpośrednio między dwoma przypisanymi miejscami.** Operator musi najpierw zwolnić jedno miejsce, potem przypisać na nowym — mniej skrajnych przypadków UX + atomowość.
- **Stoły prostokątne / podłużne.** MVP obsługuje wyłącznie okrągłe (geometria pierścienia dużo prostsza).
- **Preferencje sąsiedztwa** („kto chce siedzieć obok kogo"). Tylko konflikty — preferencje to nice-to-have v2.
- **Tagi gości** (dieta, mobilność, dzieci). Zostają tylko imię, nazwisko, strona, grupa — CRUD-w-CRUD, wycinka kosztu.
- **Eksport PDF.** MVP ma tylko widok podsumowania w przeglądarce — renderer + layout = tygodnie pracy.
- **Współedycja, obserwator, zaproszenia mailowe.** Solo MVP — eliminacja warstwy uprawnień i zaproszeń.
- **Logowanie społecznościowe (Google / Facebook).** Tylko e-mail + hasło w v1.
- **Reset / odzyskiwanie hasła.** Pełny flow (mail + strona resetu + walidacja tokenu) to ~0,5 tyg., którego nie stać nas w oknie do 2026-09-10; utrata hasła = utrata dostępu, świadome ryzyko dokumentowane na ekranie logowania.
- **Import gości z CSV / Excel.** Operator wpisuje gości ręcznie — parser + mapowanie kolumn = osobny moduł v2.
- **Powiadomienia e-mail** (przypomnienia, alerty, raporty). Poza weryfikacją konta (FR-004a) — brak infrastruktury wysyłkowej.
- **Tryb offline / synchronizacja między urządzeniami.** Aplikacja wymaga aktywnego połączenia — offline-first to osobny model danych i reconcyliacja.
- **Internacjonalizacja poza polskim.** UI tylko po polsku — persona to polskie wesela.
- **Wsparcie ekranów telefonowych / mobile-first.** Desktop + tablet; telefon nieobsługiwany formalnie — drag-and-drop 150 osób na 5,5" = zła UX z założenia.
- **Skala enterprise / tysiące jednoczesnych użytkowników.** `target_scale.users: small` — nie ma sensu projektować na skalę, której nie ma.

## Done

(Puste na pierwszej generacji. `/10x-archive` doda tu wpis — i przestawi Status pozycji na `done` — gdy change o pasującym Change ID zostanie zarchiwizowany. Format:)

- **&lt;Roadmap ID&gt;: &lt;Outcome&gt;** — Archived YYYY-MM-DD → `context/archive/YYYY-MM-DD-change-id/`. Lesson: &lt;pointer do lessons.md jeśli jest, lub `—`&gt;.
- **F-01: (foundation) schema `weddings+tables+seats` + wzorzec RLS per-operation dla owner-only** — Archived 2026-08-14 → `context/archive/2026-08-09-wedding-scope-schema-and-rls/`. Lesson: `lessons.md` "RLS migrations: revoke anon grants + use `(select auth.uid())` in policies".
- **S-01: zalogować się, mieć wesele z nazwą, dodać okrągły stół z auto-generowanymi miejscami** — Archived 2026-08-19 → `context/archive/2026-08-15-wedding-shell-with-tables/`. Lesson: —.
- **S-02: dodać, edytować, usunąć gościa; zdefiniować i usunąć binarny konflikt między parą gości** — Archived 2026-08-22 → `context/archive/2026-08-17-guest-and-conflict-management/`. Lesson: —.
