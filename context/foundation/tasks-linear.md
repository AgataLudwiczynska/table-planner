---
project: TablePlanner
version: 2
status: approved
created: 2026-08-09
updated: 2026-08-09
source: context/foundation/roadmap.md
target: Linear (workspace Agata / team Agata)
---

# Plan migracji: `roadmap.md` → Linear

> Uzgodniony format i sekwencja przenoszenia roadmap MVP do trackera Linear przez MCP.
> Wykonywany po zatwierdzeniu; roadmap.md pozostaje źródłem prawdy dla treści slice'ów.

## Kontekst

`context/foundation/roadmap.md` jest kanonicznym planem MVP TablePlanner (deadline 2026-09-10, jednoosobowy after-hours). Definiuje 1 foundation + 5 vertical slices z Prerequisites, north star, streamami i per-item Outcome/Risk/Unknowns. Żeby zamienić to na wykonalną pracę, mirrorujemy roadmap do Linear via MCP — status, priorytet i zależności żyją w jednym trackerze, bez rozbijania roadmap jako doc-of-record.

## System zadań

**Linear** — przez `linear-server` MCP.

- Workspace: `Agata` (`https://linear.app/agata-l`)
- Team: `Agata` (jedyny, prefix issue `AGA-`, `teamId: 896ee330-f0c9-412e-836b-0e6a11d79c67`)
- Zero istniejących projektów; onboardingowe AGA-1..4 usunięte ręcznie przez UI (2026-08-09).
- Etykiety wyjściowe: `Improvement`, `Bug`, `Feature` — żadna nie reużywalna.
- Statusy: `Backlog`, `Todo`, `In Progress`, `Done`, `Canceled`, `Duplicate`.
- **MCP `save_issue` obsługuje natywne relacje** przez pola `blockedBy` / `blocks` — używamy ich zamiast tekstowych URL-i w opisach. (Wcześniejsza wersja tego planu błędnie zakładała brak wsparcia — v2 naprawia.)

## Decyzje (zatwierdzone)

| Decyzja | Wybór |
| --- | --- |
| Izolacja | Osobny Project `TablePlanner MVP` w teamie `Agata` (prefix issue AGA-\*) |
| Milestony | 3 project-milestony jako bramki zależności (M1/M2/M3) |
| Zależności między issues | **Natywne relacje Linear** (`blockedBy` / `blocks`) — nie tekstowe URL-e w opisie |
| Open Roadmap Questions | 2 osobne issue z etykietą `roadmap:question`, priorytet Low |
| Parked / Non-Goals | NIE migrujemy — zostają w roadmap.md § Parked |
| Streams | NIE osobno — tylko etykiety `stream:a` / `stream:b` |
| Format tytułu | `[F-01] Wedding-scope schema + RLS pattern` (prefix roadmap ID w `[]`, EN engineering-style) |
| Onboarding AGA-1..4 | Usunięte przez użytkownika przed migracją |
| Link zwrotny w roadmap.md | Tak — jedna linijka pod głównym nagłówkiem |
| Język — tytuły | EN, engineering-style (imperativ) — spójne z Change ID i tooling |
| Język — treść opisów | PL, sparafrazowany (nie verbatim z roadmap.md — Outcome krótki, żeby edycja roadmap.md nie wymagała re-syncu Linear) |
| Język — strukturalne pola | EN (`## Outcome`, `Change ID`, `PRD refs`, `Prerequisites`, `Parallel with`) |
| Chudy opis issue | Tylko: Change ID, PRD refs, Prerequisites, Parallel with, krótki Outcome. **Wycięte:** Roadmap ID (jest w tytule), Stream (w labelu), Blocks (natywna relacja), Unknowns, Risk (żyją w roadmap.md — Linear nie mirroruje). |

## Struktura docelowa w Linear

### Projekt

**`TablePlanner MVP`** (jeden project w teamie `Agata`):

- `startDate: 2026-08-09`
- `targetDate: 2026-09-10`
- Opis: Vision recap (z roadmap.md), wskazanie S-03 jako north star, link do `context/foundation/roadmap.md` w repo.

### Milestony (3 bramki)

| Milestone | Gate on | Znaczenie |
| --- | --- | --- |
| `M1: Foundation ready` | F-01 done | Schema + wzorzec RLS shipped |
| `M2: North star live` | S-01, S-02, S-03 done | Real-time walidacja sąsiedztwa działa end-to-end |
| `M3: MVP complete` | S-04, S-05 done | Edycja stołu + licznik postępu + persystencja |

### Etykiety (6 nowych, workspace-scoped)

| Nazwa | Zastosowanie |
| --- | --- |
| `roadmap:foundation` | F-01 |
| `roadmap:slice` | S-01..S-05 |
| `roadmap:north-star` | tylko S-03 |
| `roadmap:question` | 2 Open Roadmap Questions |
| `stream:a` | F-01, S-01, S-03, S-04, S-05 |
| `stream:b` | S-02 |

### Issues (8 total: 6 roadmap + 2 open questions)

**Szablon opisu — roadmap issue (Markdown, chudy):**

```markdown
**Change ID:** `<change-id z roadmap>`
**PRD refs:** <lista PRD refs z roadmap, verbatim>
**Prerequisites:** — | F-01 | S-01, S-02
**Parallel with:** — | S-02 | S-05

## Outcome
<1–2 zdania parafrazy z roadmap.md — nie verbatim>

---
Source: `context/foundation/roadmap.md` § F-01
```

**Szablon opisu — open question (chudszy):**

```markdown
**PRD ref:** Open Question #X
**Owner:** user | downstream
**Deadline:** <opcjonalnie>

## Question
<treść pytania, verbatim z roadmap>

---
Source: `context/foundation/roadmap.md` § Open Roadmap Questions #X
```

**Zależności:** wyrażane przez natywne pole `blockedBy` przy `save_issue`, NIE w opisie. Deklaracja `Prerequisites:` w opisie zostaje jako czytelna narracja, ale prawdziwe źródło to metadata Linear.

**Mapa mocy — 6 issue z roadmap:**

| Roadmap ID | Tytuł | Etykiety | Status | Priority | Milestone |
| --- | --- | --- | --- | --- | --- |
| F-01 | `[F-01] Wedding-scope schema + RLS pattern` | `roadmap:foundation`, `stream:a` | Todo | Urgent (1) | M1 |
| S-01 | `[S-01] Create wedding + add first round table` | `roadmap:slice`, `stream:a` | Backlog | High (2) | M2 |
| S-02 | `[S-02] Manage guests + define conflicts` | `roadmap:slice`, `stream:b` | Backlog | High (2) | M2 |
| S-03 | `[S-03] Real-time adjacency validation on assignment` | `roadmap:slice`, `roadmap:north-star`, `stream:a` | Backlog | High (2) | M2 |
| S-04 | `[S-04] Edit table — shrink seats or delete` | `roadmap:slice`, `stream:a` | Backlog | Medium (3) | M3 |
| S-05 | `[S-05] Progress counter + cross-session persistence` | `roadmap:slice`, `stream:a` | Backlog | Medium (3) | M3 |

**Mapa mocy — 2 open questions (bez milestone):**

| Tytuł | Etykiety | Status | Priority |
| --- | --- | --- | --- |
| `[Q1] Email verification in v1 (FR-004a)?` | `roadmap:question` | Backlog | Low (4) |
| `[Q2] Validation performance target (PRD Open #1)` | `roadmap:question` | Backlog | Low (4) |

**Assignee:** wszystkie na `me`.
**Status mapping:** roadmap `ready` → Linear `Todo`; roadmap `proposed` → Linear `Backlog`.

## Kroki wykonania

1. **Etykiety** — utwórz 6 nowych workspace labels (kolory dowolne, spójny prefix `roadmap:` / `stream:`).
2. **Projekt** — `save_project` z name `TablePlanner MVP`, krótki opis (north star + milestone gates + link do roadmap.md), `startDate: 2026-08-09`, `targetDate: 2026-09-10`, team `Agata`.
3. **Milestony** — `save_milestone` ×3 (M1/M2/M3) na powstałym projekcie.
4. **Issues — jednoprzebiegowo, warstwami po zależnościach** — każde `save_issue` z `blockedBy` wskazującym już utworzone ID poprzedników:
   - Layer 0: **F-01** (bez blockerów).
   - Layer 1: **S-01**, **S-02** równolegle (`blockedBy: [F-01]`).
   - Layer 2: **S-03** (`blockedBy: [S-01, S-02]`).
   - Layer 3: **S-04**, **S-05** równolegle (`blockedBy: [S-03]`).
   - Layer 4: **Q1**, **Q2** równolegle (bez blockerów, bez milestone).
   Każdy issue: labels, priority, status, project, projectMilestone (jeśli dotyczy), assignee `me`, chudy opis z szablonu.
5. **Link zwrotny w roadmap.md** — dopisać linijkę cytatu bezpośrednio pod `# Roadmap: TablePlanner`:
   ```markdown
   > **Tracked in Linear:** <project-url>
   ```
6. **Raport końcowy** — tabela mapowania `Roadmap ID → AGA-N (URL)` + URL projektu, pokazana userowi.

## Nie robimy w tej migracji

- Nie modyfikujemy treści `roadmap.md` poza jedną linijką linka zwrotnego.
- Nie tworzymy GitHub issues / PR wiring / integracji Linear↔GitHub.
- Nie migrujemy 16 pozycji z `## Parked` — zostają w doc.
- Nie kopiujemy do Linear pełnych sekcji `Unknowns` / `Risk` — żyją w roadmap.md (Linear = tracker, nie doc mirror).
- Nie tworzymy cykli/estymat/story pointów (`speed` + solo — pomijamy proces-heavy elementy).

## Weryfikacja po migracji

1. `list_projects` → widać `TablePlanner MVP` z targetDate 2026-09-10 i 3 milestonami.
2. `list_issues project:"TablePlanner MVP"` → 8 pozycji; każda z poprawnym labelem/statusem/priorytetem/milestone.
3. Spot-check **F-01**: labels `roadmap:foundation` + `stream:a`; status `Todo`; priority `Urgent`; milestone `M1`; **natywne pole `blocks` zawiera S-01 i S-02**.
4. Spot-check **S-03**: labels zawierają `roadmap:north-star`; **natywne pole `blockedBy` zawiera S-01 i S-02**; `blocks` zawiera S-04 i S-05.
5. Spot-check pierwszej linii `roadmap.md` — cytat `> **Tracked in Linear:** …` z URL-em projektu.
6. Raport `Roadmap ID → AGA-ID` przedstawiony w chat, żeby user mogła eyeballnąć mapping.

## Referencje

- Źródło treści: `context/foundation/roadmap.md`
- Linear team id: `896ee330-f0c9-412e-836b-0e6a11d79c67`
- MCP tools użyte: `create_issue_label`, `save_project`, `save_milestone`, `save_issue`, `list_projects`, `list_issues` (weryfikacja).
