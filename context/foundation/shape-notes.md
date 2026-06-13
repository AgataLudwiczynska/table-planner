---
project: "TablePlanner"
context_type: greenfield
created: 2026-05-30
updated: 2026-05-30
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona"
      decision: "Jedna osoba z pary młodej (operator); współedytorzy/obserwatorzy decydowani w Fazie 2."
    - topic: "core pain"
      decision: "Brak walidacji sąsiedztw + brak wizualizacji geometrii stołu + brak spójności przy zmianach + brak czystego eksportu."
    - topic: "insight"
      decision: "Konkurencja modeluje salę (meble), nie modeluje sąsiedztwa miejsc przy stole."
    - topic: "login mechanism"
      decision: "E-mail + hasło, prosta rejestracja. Bez social login."
    - topic: "role model"
      decision: "Tylko właściciel (solo). Brak współedytora i obserwatora w MVP — do v2."
    - topic: "invitations"
      decision: "Brak w MVP (nie istnieją bez ról wieloosobowych)."
    - topic: "password reset"
      decision: "Otwarte → ## Open Questions."
    - topic: "MVP scope cuts"
      decision: "Wycięte: preferencje, prostokątne stoły, tagi gości, PDF eksport, współedycja."
    - topic: "table seat reduction UX"
      decision: "Dialog potwierdzenia z auto-unassign najwyższych miejsc."
    - topic: "guest 'side' field"
      decision: "Opcjonalne; 3 wartości: panna młoda / pan młody / wspólne + null."
    - topic: "unassigned list placement"
      decision: "Zawsze widoczny sidebar."
    - topic: "conflict severity"
      decision: "Binarne (bez hard/soft tier)."
    - topic: "assignment mechanism"
      decision: "Oba: drag&drop + click fallback."
    - topic: "real-time validation"
      decision: "Bezwarunkowo real-time, optymalizacja po stronie algorytmu jeśli wolno."
    - topic: "conflict visualization"
      decision: "Czerwone podświetlenie obu miejsc + ikona + lista w panelu (bez rysowanej linii)."
    - topic: "summary view format"
      decision: "Graficzny okrąg z miejscami numerowanymi + imionami."
  frs_drafted: 24
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-05
  after_hours_only: true
---

# TablePlanner — shape notes

Seed source: `idea-notes.md` (Polish).

## Vision & Problem Statement

Para młoda planująca wesele z listą **100–150 gości** musi ułożyć plan miejsc przy stołach — nie tylko kto przy którym stole, ale **kto siedzi obok kogo**. Musi uwzględnić konflikty (np. skłóceni krewni, rozwiedzeni rodzice), preferencje (kto z kim chce siedzieć) i geometrię stołów (okrągłe — pierścień sąsiedztw; prostokątne/podłużne — dwa rzędy + naprzeciwko). Dziś robi to na karteczkach lub w Excelu — bez walidacji sąsiedztw, bez wizualizacji geometrii stołu, bez sensownego eksportu na finalny dokument dla sali, i bez wsparcia przy zmianach listy gości (każda rezygnacja / dopisanie pociąga ręczne przelosowanie pół stołu).

**Insight:** istniejące aplikacje weselne (allseated, weddingmapper itp.) skupiają się na rozłożeniu mebli na sali — pokazują stoły jako prostokąty/koła w przestrzeni, ale **nie modelują relacji sąsiedztwa miejsc przy stole** ani nie sprawdzają konfliktów "obok". TablePlanner to nie planer sali — to walidator sąsiedztw.

## User & Persona

**Primary persona — "Operator pary młodej"**

- **Kto:** jedna osoba z pary młodej (panna młoda lub pan młody), która bierze na siebie operacyjne planowanie wesela.
- **Kontekst:** ma listę 100–150 gości w głowie lub w arkuszu, zna kto z kim w jakiej relacji, ma już rozeznanie co do liczby i kształtu stołów na sali.
- **Moment, w którym sięga po aplikację:** lista gości jest w miarę ustabilizowana, sala wybrana, znana liczba stołów — pora przypisać konkretne miejsca i sprawdzić, czy nigdzie nie ma katastrofy sąsiedzkiej.
- **Co ją boli (z odpowiedzi):**
  - brak walidacji sąsiedztw — konflikty wychodzą dopiero przy stole,
  - w Excelu nie da się sobie wyobrazić kształtu stołu i geometrii sąsiedztw,
  - na papierze trudno to robić w sposób iteracyjny / "reusable" (każda zmiana = przepisywanie),
  - trudno utrzymać spójność przy zmianach listy gości.

### Secondary persona

**Brak w MVP.** Decyzja w Fazie 2: aplikacja w MVP serwuje wyłącznie operatora pary młodej (solo). Współedytorzy i obserwatorzy zostają wycięci do v2 — wraca to do `## Non-Goals`.

## Access Control

**Model: jedna rola, jeden użytkownik per projekt weselny — właściciel.** Pełny dostęp do swojego planu wesela; brak współedycji, brak obserwatorów, brak zaproszeń.

- **Login:** e-mail + hasło. Prosta rejestracja (e-mail + hasło). Brak loginu społecznościowego (Google/FB) — to jest w `## Non-Goals`.
- **Granica danych:** każdy użytkownik widzi tylko swoje wesele(a). Wesele jest "własnością" konta; nie ma współdzielenia w MVP.
- **Co się dzieje gdy niezalogowany trafia na trasę chronioną:** redirect na ekran logowania.
- **Reset hasła:** *otwarte pytanie* — nie zapadła decyzja, czy w MVP. Jeśli nie, to ryzykowne UX (zapomnę hasła = stracony plan wesela). → `## Open Questions`.

> **Decyzja scope-down (Faza 2):** oryginalne notatki przewidywały 3 role (właściciel / współedytor / obserwator) i zaproszenia mailowe. W MVP zostajemy z samym właścicielem. Argument: wesele to projekt z jednym głównym operatorem; współedycja i podgląd to wygoda, nie konieczność v1. Realnie znacząco zmniejsza powierzchnię MVP (modele user→rola, zaproszenia, polityki RBAC).

## Success Criteria

### Primary

- **Pełny flow działa end-to-end dla okrągłego stołu z konfliktami:** Operator pary młodej zakłada konto (e-mail+hasło), tworzy wesele, dodaje stoły okrągłe z dowolną liczbą miejsc, wpisuje gości (imię, nazwisko, strona, grupa), definiuje pary konfliktowe ("nie obok"), przypisuje gości do konkretnych miejsc przy stołach, i widzi na żywo (bez klikania "Sprawdź") flagowanie naruszeń sąsiedztwa — gdzie konflikt jest, kogo dotyczy.
- **Geometria sąsiedztwa działa poprawnie dla pierścienia:** miejsce N sąsiaduje z N−1 i N+1 modulo liczba miejsc; konflikt flagowany TYLKO między bezpośrednimi sąsiadami, nie między dowolnymi osobami przy stole.

### Secondary

- **Operator widzi liczbowy postęp** (np. "87 / 150 gości przypisanych"). Wsparcie psychologiczne i motywacja do uko­ńczenia planu w jednej sesji.

### Guardrails

- **Invariant przypisań:** każdy gość jest na maksymalnie jednym miejscu; każde miejsce ma maksymalnie jednego gościa. Aplikacja nigdy nie pozwala na złamanie tej zasady (twardy invariant po stronie modelu, nie tylko UI).
- **Walidacja konfliktów nigdy nie milczy:** jeśli dwóch gości oznaczonych jako "nie obok" znajdzie się na sąsiednich miejscach, aplikacja MUSI to wskazać. False negatives = 0. False positives (alerty gdy konfliktu nie ma) akceptowalne.
- **Prywatność danych gości:** lista gości, konflikty, plan wesela są dostępne wyłącznie właścicielowi konta. Niezalogowany ani inny zalogowany użytkownik NIE widzi cudzego planu.

### Decyzje scope-down (Faza 3)

W MVP wycięte vs. oryginalne notatki:

- **Preferencje** ("kto chce siedzieć obok kogo") — wycięte. Konflikty są clou; preferencje to nice-to-have v2.
- **Stoły prostokątne / podłużne** — wycięte. MVP obsługuje TYLKO okrągłe. Geometria prostokątna (dwa rzędy + naprzeciwko) do v2.
- **Tagi gości** (dieta / mobilność / dzieci) — wycięte. Zostają tylko: strona (panna/pan młody) + grupa (rodzina / przyjaciele / współpracownicy).
- **Eksport PDF** — wycięty. MVP ma tylko widok podsumowania w przeglądarce. PDF do v2.
- **Współedycja, obserwator, zaproszenia mailowe** — wycięte (z Fazy 2). Solo MVP.

### Timeline budget

`mvp_weeks: 3` — operator pracuje po godzinach. Praca skondensowana, MVP odchudzony do walidatora konfliktów dla jednego kształtu stołu.

## Functional Requirements (draft, before Socrates)

### Authentication

- FR-001: Operator can register an account with email and password. Priority: must-have
- FR-002: Operator can log in with email and password. Priority: must-have
- FR-003: Operator can log out. Priority: must-have

### Wedding management

- FR-004: Operator can create a wedding by giving it a name. Priority: must-have
- FR-005: Operator can edit the wedding name. Priority: must-have

### Tables

- FR-006: Operator can add a round table with a name and seat count. Priority: must-have
- FR-007: System auto-generates numbered seats (1..N) for each table on creation. Priority: must-have
- FR-008: Operator can edit a table's name and seat count. If the new seat count is lower than the number of currently assigned guests, the system shows a confirmation dialog ("Zmniejszenie zwolni miejsca dla N gości — kontynuować?") and on confirmation auto-unassigns guests from the highest-numbered removed seats. Priority: must-have
  > Socrates: Counter-argument considered: "blokuj dopóki użytkownik sam nie wyjmie gości" (pełna kontrola) vs "ciche auto-unassign" (mniej klikania, ryzyko zaskoczenia). Resolution: dialog z potwierdzeniem — kompromis: nic nie ginie po cichu, ale jeden klik wystarcza.
- FR-009: Operator can delete a table (with confirmation; unassigns its guests). Priority: must-have

### Guests

- FR-010: Operator can add a guest with first name, last name, optional side (panna młoda / pan młody / wspólne / nieokreślone), and group (rodzina / przyjaciele / współpracownicy). Priority: must-have
  > Socrates: Counter-argument considered: "side wymagane = czystsze dane" vs "opcjonalne z 'wspólne' = realny model relacji". Resolution: opcjonalne, ale z trzecią wartością "wspólne"; wartość może też być null (niewypełniona).
- FR-011: Operator can edit a guest's details. Priority: must-have
- FR-012: Operator can delete a guest (unassigns from any seat). Priority: must-have
- FR-013: Operator sees the list of unassigned guests as an always-visible sidebar next to the table view. Priority: must-have
  > Socrates: Counter-argument considered: "zakładka/panel składany daje więcej miejsca dla stołów" vs "zawsze widoczna lista daje wsparcie psychologiczne". Resolution: zawsze widoczna — zgodnie z seed; lista jest częścią tożsamości produktu, nie elementem do schowania.

### Conflicts

- FR-014: Operator can define a binary conflict between two guests ("nie obok siebie"). No severity tiers in MVP. Priority: must-have
  > Socrates: Counter-argument considered: "hard/soft tier system pozwala na niuanse". Resolution: w MVP binarnie. Tier system to nowy model + nowe UI + nowa walidacja; do v2 jeśli realna potrzeba.
- FR-015: Operator can remove a defined conflict. Priority: must-have
- FR-016: Operator can see a list of all defined conflicts. Priority: must-have

### Seat assignment

- FR-017: Operator can assign an unassigned guest to a specific seat via BOTH drag-and-drop (from the unassigned sidebar to a seat) AND click-based fallback (click guest → click seat). Priority: must-have
  > Socrates: Counter-argument considered: "tylko drag&drop wystarczy, mniej kodu" vs "tylko click, prostsza implementacja" vs "oba dla różnych preferencji". Resolution: oba. Drag&drop jest szybkie przy 150 osobach; click fallback ratuje urządzenia dotykowe i sytuacje gdy drag nie działa.
- FR-018: Operator can unassign a guest from a seat (returning them to the unassigned list). Priority: must-have
- FR-019: System enforces the invariant: at most one guest per seat, at most one seat per guest. Priority: must-have

### Real-time validation

- FR-020: System computes adjacency for round tables as a ring (seat N is adjacent to N−1 and N+1, modulo seat count). Priority: must-have
- FR-021: System highlights conflict violations between adjacent guests immediately on every assignment change. No "Validate" button. If performance becomes an issue at 150 guests, optimize the algorithm — do not introduce a manual validation step. Priority: must-have
  > Socrates: Counter-argument considered: "debounce/throttle" lub "klik 'Sprawdź' powyżej N gości" jako wentyl bezpieczeństwa. Resolution: real-time bez warunków. Jest to guardrail produktu — wprowadzenie ręcznego sprawdzania łamie obietnicę produktu. Optymalizacja po stronie algorytmu (np. inkrementalne ponowne sprawdzanie tylko zmienionych miejsc) jest droga sprzętowa.
- FR-022: System shows conflict violations as red highlighting on both involved seats plus a warning icon. Additionally, a list of currently violated conflicts (named pairs) appears in the wedding summary view. Priority: must-have
  > Socrates: Counter-argument considered: "linia łącząca konfliktowe miejsca" lub "tylko lista bez highlight" lub "wszystko naraz". Resolution: highlight + ikona + lista (BEZ rysowanej linii). Lokalna informacja gdzie jest problem + globalna lista do przeglądu. Linia łącząca = dodatkowa biblioteka SVG, do v2.

### Summary view

- FR-023: Operator can see a per-table summary as a graphical ring (round drawing) with numbered seats and the assigned guest's name at each seat. Priority: must-have
  > Socrates: Counter-argument considered: "tabela numer→gość jest prostsza w implementacji". Resolution: graficzny okrąg jest centralnym insightem produktu (kształt stołu zmienia sąsiedztwo) — odebranie tego = produkt redukuje się do listy, którą można mieć w Excelu.
- FR-024: Operator can see the overall assignment progress count (e.g. "87 / 150 guests assigned"). Priority: must-have

### Socrates auto-stamp (trivial FRs)

Następujące FR-y nie miały realnego kontrargumentu i są zapisane jako "stoi jak jest" bez osobnego challenge'u: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, FR-011, FR-012, FR-015, FR-016, FR-018, FR-019, FR-020, FR-024.

## User Stories

### US-01: Operator dostrzega konflikt sąsiedztwa w czasie rzeczywistym

- **Given** jestem zalogowanym operatorem z weselem zawierającym co najmniej jeden okrągły stół, mam na liście nieprzypisanych co najmniej dwóch gości (A i B), oraz zdefiniowałam między nimi konflikt
- **When** przypisuję gościa A do miejsca 3 przy stole T1, a następnie przypisuję gościa B do miejsca 2 (sąsiedniego) przy tym samym stole
- **Then** natychmiast widzę: (a) miejsca 2 i 3 są podświetlone na czerwono z ikoną ostrzeżenia, (b) w widoku podsumowania pojawia się wpis na liście naruszonych konfliktów wskazujący parę A ↔ B

#### Acceptance Criteria

- Podświetlenie pojawia się BEZ jakiegokolwiek przycisku "Sprawdź" — natychmiast po zwolnieniu drag-a lub potwierdzeniu kliku.
- Jeśli przeniosę gościa B na miejsce 5 (niesąsiednie z 3), podświetlenie znika, a wpis na liście naruszeń znika równolegle.
- Obaj goście pozostają przypisani — system NIE auto-odwiązuje gości przy wykryciu konfliktu (operator decyduje co zrobić).
- Jeśli dodam trzeciego gościa C, nie powiązanego konfliktem, na sąsiednie miejsce 4, nie pojawia się żadne dodatkowe ostrzeżenie.

### US-02: Operator zmniejsza liczbę miejsc przy stole

- **Given** mam stół T1 z 10 miejscami, z czego 7 jest zajętych przez przypisanych gości (miejsca 1–7)
- **When** edytuję stół T1 i zmieniam liczbę miejsc z 10 na 5
- **Then** system pokazuje dialog: "Zmniejszenie zwolni miejsca dla 2 gości (z miejsc 6 i 7) — kontynuować?" z dwoma przyciskami: "Anuluj" / "Zwolnij i zmień"

#### Acceptance Criteria

- "Anuluj" pozostawia stół bez zmian — wciąż 10 miejsc, wszyscy goście na swoich miejscach.
- "Zwolnij i zmień" wykonuje obie operacje atomowo: stół ma 5 miejsc, goście z miejsc 6 i 7 wracają na listę nieprzypisanych (sidebar).
- Jeśli zmniejszam do liczby ≥ obecnej liczby przypisanych (np. z 10 do 8 przy 7 przypisanych), dialog się NIE pokazuje — zmiana następuje od razu.
- Po zwolnieniu miejsc, jeśli zwolnieni goście mieli konflikty sąsiedzkie, naruszenia z nimi związane znikają z listy.

### US-03: Operator kończy plan z 150/150 gośćmi i 0 konfliktami

- **Given** mam wesele ze stołami o łącznej liczbie miejsc równej 150, listę 150 gości i N zdefiniowanych konfliktów; aktualnie wszyscy goście są nieprzypisani
- **When** przypisuję ostatniego (150-tego) gościa do ostatniego wolnego miejsca w sposób, który nie tworzy żadnego naruszenia konfliktu
- **Then** licznik postępu pokazuje "150 / 150 gości przypisanych", lista nieprzypisanych jest pusta, lista naruszonych konfliktów jest pusta, a widok podsumowania pokazuje wszystkie stoły z pełnymi miejscami

#### Acceptance Criteria

- Licznik aktualizuje się z każdym przypisaniem (nie tylko na końcu).
- Jeśli ostatnie przypisanie tworzy konflikt, licznik nadal pokazuje "150 / 150" — postęp nie zależy od poprawności walidacji — ale lista naruszonych konfliktów rośnie o tę parę.
- Operator może wylogować się i po ponownym zalogowaniu zobaczyć ten sam stan: 150/150, te same konflikty (jeśli były).
- Brak licznika "ukrytego" — wartość "150 / 150" jest widoczna w widocznym miejscu (np. w nagłówku lub w sidebar listy nieprzypisanych).

## Business Logic

**TablePlanner waliduje sąsiedztwa miejsc przy stole w czasie rzeczywistym — biorąc pod uwagę geometrię stołu (okrąg = pierścień), wykrywa pary skłóconych gości siedzących obok siebie i sygnalizuje to operatorowi natychmiast po każdej zmianie przypisania.**

**Wejście** (z perspektywy operatora):

- lista gości weselnych z metadanymi (imię, nazwisko, opcjonalnie strona, grupa),
- lista zdefiniowanych konfliktów — par gości oznaczonych jako "nie obok siebie",
- konfiguracja stołów (okrągłe z liczbą miejsc),
- aktualny stan przypisań gość → miejsce.

**Decyzja, jaką aplikacja podejmuje:** czy aktualna konfiguracja narusza zdefiniowane konflikty sąsiedzkie — dla każdej pary konfliktowej sprawdza, czy oba elementy pary znajdują się w relacji "bezpośrednie sąsiedztwo" (przy okrągłym stole: sąsiedztwo to relacja pierścienia — miejsce N graniczy z N−1 i N+1 modulo liczba miejsc).

**Wyjście, które widzi użytkownik:** lokalna sygnalizacja konfliktów (czerwone podświetlenie konfliktowych miejsc + ikona) oraz globalna lista naruszeń w panelu podsumowania, aktualizowane natychmiast po każdej zmianie przypisania, bez wymagania ręcznego "Sprawdź".

Reguła jest **stateless w sensie decyzji** — ta sama konfiguracja zawsze daje ten sam wynik. Aplikacja nie sugeruje rozmieszczeń, nie ocenia jakości planu, nie generuje alternatyw — wyłącznie weryfikuje sąsiedztwa względem deklarowanych przez operatora konfliktów.

## Non-Functional Requirements

- **Stan planu jest trwały:** po wylogowaniu i ponownym zalogowaniu operator widzi dokładnie ten sam plan, jaki zostawił — wszyscy przypisani goście na tych samych miejscach, wszystkie zdefiniowane konflikty zachowane, wszystkie stoły bez zmian. Brak niedeterministycznych start-state'ów lub utraty pracy między sesjami.
- *(Implicit, ustalone w FR-021 Socratesie i guardrails Fazy 3)*: walidacja sąsiedztwa działa w odczuwalnym czasie rzeczywistym — bez ręcznego przycisku "Sprawdź" i bez zauważalnego opóźnienia dla planów do 150 gości. Konkretny target (np. < 200ms p95) zostawiony do decyzji impl, ale "natychmiastowość" jest twardym wymaganiem produktu.

## Non-Goals

### Functional non-goals (MVP nie buduje)

- **Algorytm sugestii rozmieszczenia (auto-sit).** Brak AI/heurystyk samodzielnie układających plan; operator zawsze decyduje. *Rationale:* zachowanie kontroli + uniknięcie czarnej skrzynki sugerującej "niewłaściwe" sąsiedztwa.
- **Wizualny plan sali (rozkład mebli w przestrzeni).** TablePlanner to walidator sąsiedztw, nie planer sali. *Rationale:* główny insight (sąsiedztwo, nie meblowanie) — odrębna kategoria narzędzi.
- **Drag&drop bezpośrednio między dwoma przypisanymi miejscami.** Operator musi najpierw zwolnić jedno miejsce (przeciągnij na sidebar) i potem przypisać na nowym. *Rationale:* mniej skrajnych przypadków UX + atomowość operacji.
- **Stoły prostokątne / podłużne.** MVP obsługuje wyłącznie okrągłe. *Rationale:* geometria pierścienia jest dużo prostsza niż dwa rzędy + naprzeciwko; wycinka kosztu.
- **Preferencje sąsiedztwa** ("kto chce siedzieć obok kogo"). Tylko konflikty. *Rationale:* preferencje są nice-to-have v2.
- **Tagi gości** (dieta, mobilność, dzieci). Zostają tylko: imię, nazwisko, strona, grupa. *Rationale:* CRUD-w-CRUD; wycinka kosztu.
- **Eksport PDF.** MVP ma tylko widok podsumowania w przeglądarce. *Rationale:* PDF renderer + layout = tygodnie pracy; v2.
- **Współedycja, obserwator, zaproszenia mailowe.** Solo MVP — jeden właściciel per wesele. *Rationale:* eliminacja całej warstwy RBAC + zaproszeń.
- **Logowanie społecznościowe (Google / Facebook).** Tylko e-mail + hasło. *Rationale:* z seed; brak integracji z OAuth providers w v1.
- **Import gości z CSV / Excel.** Operator wpisuje gości ręcznie w aplikacji. *Rationale:* parser CSV + obsługa błędnych formatów + UI mapowania kolumn = osobny moduł; v2.
- **Powiadomienia e-mail** (reminders, alerts, raport). MVP nie wysyła żadnej poczty (poza weryfikacją konta, jeśli okaże się potrzebna). *Rationale:* brak nadawcy SMTP, brak template'ów; v2.

### Non-functional non-goals (MVP nie aspiruje)

- **Tryb offline / sync między urządzeniami.** Aplikacja wymaga aktywnego połączenia z internetem. *Rationale:* offline-first = osobny model danych + reconciliation; v2.
- **Internacjonalizacja poza polskim.** UI tylko po polsku. *Rationale:* persona to polskie wesela; uniwersalizacja przedwczesna.
- **Mobile-first / responsywność na małe ekrany.** Aplikacja celuje w desktop + tablet. Telefon nieobsługiwany formalnie. *Rationale:* drag&drop 150 osób na ekranie 5,5 cala — zła UX z założenia.
- **Skala enterprise / tysiące jednoczesnych użytkowników.** MVP celuje w pojedyncze konta (target_scale: ≤ 10). *Rationale:* nie ma sensu projektować na skalę, której nie ma.

## Open Questions

1. **Reset hasła w MVP — tak czy nie?** Operator: zapomnę hasła = stracony plan wesela (i 100+h pracy operatora). UX-owo ryzykowne pominąć w MVP, ale dodanie pełnego flow reset-link + token + new-password = ~0,5 tygodnia. *Owner:* user. *Do decyzji przed planem implementacji.*
2. **Czy `target_scale` ≤ 10 wymaga jakiejkolwiek weryfikacji e-mail przy rejestracji?** Może być pominięte (instant signup) jeśli skala jest tak mała; jeśli planujemy szerszą dystrybucję — wymóg potwierdzenia mailowego. *Owner:* user. *Do decyzji przed planem implementacji.*
3. **Konkretny target performance dla walidacji** (np. < 200ms p95 dla 150 gości i N konfliktów). FR-021 Socrates ustalił "bezwarunkowo real-time" jako zasadę, ale nie nazwał liczby. *Owner:* downstream (faza implementacji / wybór algorytmu).
4. **Czy weryfikujemy adres mail przed pełną aktywacją konta?** Pokrewne do (2), ale o aktywacji vs tylko o rejestracji. *Owner:* user.

## Quality cross-check

| Element | Status |
|---|---|
| Access Control | present |
| Business Logic (one-sentence rule) | present |
| Project artifacts | present |
| Timeline-cost ack | present (mvp_weeks: 3) |
| Non-Goals | present (12 entries) |
| Preserved behavior | n/a (greenfield) |

Wszystkie elementy obecne. `quality_check_status: accepted`. Open Questions wymienione powyżej trafiają verbatim do PRD `## Open Questions`.

