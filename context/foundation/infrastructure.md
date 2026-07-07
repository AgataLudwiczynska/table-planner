---
project: TablePlanner
researched_at: 2026-06-14
recommended_platform: Cloudflare Workers (Static Assets)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (+ React islands)
  runtime: Cloudflare workerd (via @astrojs/cloudflare v13 + nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers (Static Assets path).**

Decyzja podjęta po pogłębionym porównaniu dwóch shortlisted platform z 5×Pass w matrycy (Cloudflare i Netlify). Cloudflare wygrał na **zero migration cost** — stack jest już spinned na `@astrojs/cloudflare` v13 (Astro 6 wymusił Workers Static Assets, Pages dropped przez sam adapter), `wrangler.jsonc` jest skonfigurowany, CI w `.github/workflows/ci.yml` referuje SUPABASE_URL/SUPABASE_KEY pod Cloudflare deploy. Drugi sygnał: **brak build minute limits** (build leci local/CI bez metra), $0 cost dla `target_scale.users: small` na free tier (100k req/day), 13 publicly-available MCP servers (Workers Bindings, Observability, Documentation). Cross-check ujawnił realne ryzyka — otwarte Astro 6 + React island + workerd bugi i dwa CVE na adapterze — które adresowane są w risk register poniżej z konkretną mitigation per ryzyko.

## Platform Comparison

Wszystkie 6 platform z `agent-friendly-criteria.md` pool przeszło twarde filtry: Q1 = "Nie" (request/response only — żaden serverless-only kandydat nie wypadł), runtime TypeScript/Node-compatible obsługiwany wszędzie po adapter swapie. Soft weights z wywiadu: Q4 = "jeden region (Polska)" *usuwa* edge-native bonus (Cloudflare nie zyskuje extra punktu za global edge — wybór wciąż wygrywa na innych wymiarach); Q5 = "external Supabase" *usuwa* co-location bonus (Railway/Render/Fly tracą atut integrated DB).

| Platforma | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration |
|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (`developers.cloudflare.com/llms.txt` + `llms-full.txt` + markdown via `index.md`) | Pass (`wrangler deploy` / `wrangler rollback` / `wrangler tail`) | Pass (13 publicly-available MCP servers — Workers Bindings, Observability, Docs) |
| **Netlify** | Pass | Pass | Pass (`docs.netlify.com/llms.txt` + `.md` suffix) | Pass (`netlify deploy --prod`; draft-by-default safety) | Pass (`@netlify/mcp` GA, prod-ready, 124+ commits) |
| **Vercel** | Pass | Pass | Pass (`vercel.com/docs/llms-full.txt`) | Pass (`vercel deploy --prod` / `vercel rollback`) | Partial (Vercel MCP **Beta** od sierpnia 2025; sprawdzone 2026-06-14) |
| **Render** | Pass (niektóre `ea *` subcommands early-access) | Pass (Native Node Web Service) | Partial (HTML docs, brak potwierdzonego llms.txt) | Pass (CLI v2.19.0, GA) | Partial (`mcp.render.com/mcp` istnieje, brak explicit GA/beta badge; sprawdzone 2026-06-14) |
| **Railway** | Pass | Partial (containers via Nixpacks/Railpack — mniej zarządzane niż serverless) | Partial (`docs.railway.com` HTML, brak publicznego llms.txt) | Pass (`railway up` / `railway redeploy` — brak dedykowanego `rollback`) | Partial (`mcp.railway.com` OAuth + `@railway/mcp-server` — docs nazywają "work in progress"; sprawdzone 2026-06-14) |
| **Fly.io** | Pass | Partial (raw OCI containers + Dockerfile required) | Partial (markdown source + GitHub, brak llms.txt) | Pass (`flyctl deploy` / `flyctl releases rollback`) | Partial (`superfly/flymcp` ~4 commits, ~33 stars — **preview/early-stage**, sprawdzone 2026-06-14) |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Static Assets) — Recommended

Trzy load-bearing argumenty: (a) **zero migration cost** — stack już jest na `@astrojs/cloudflare` v13, wybór dowolnej innej platformy oznacza swap adaptera + przepisanie `CLAUDE.md` (wzmianki o `wrangler`, `workerd`, `.dev.vars`, `nodejs_compat`) + retest CI = ~0.5-1 dnia, czyli ~5% budżetu after-hours sprintu; (b) **brak build minute limits** — Cloudflare buduje na lokalu/CI, Workers płaci tylko za requesty; przy intensywnej iteracji w ostatnim tygodniu przed deadline 2026-07-05 to materialna przewaga vs Netlify Free (300 build min/mo); (c) **najbogatsze MCP coverage** — 13 publicly-available servers (Workers Bindings dla env/secrets, Workers Observability dla logów, Cloudflare Documentation dla agent-readable docs) — superior do Netlify (1 MCP, GA-dojrzały) jeśli AI agent ma być realnym operatorem platformy. Free tier 100k req/day pokrywa MVP z marginesem rzędu 10×.

#### 2. Netlify — Runner-up

Druga lokalna optimum z 5×Pass i bardzo dojrzałym `@netlify/mcp` (rok produkcji, 124+ commits). Główne argumenty *za* gdyby Cloudflare odpadł: (a) `netlify deploy` draft-by-default jako natywny safety net przeciw przypadkowej publikacji produkcji, (b) Atomic Deploys + instant rollback przez dashboard bez rebuilda, (c) Node Functions runtime ≈ `npm run dev` (Vite/Node) — mniej "działa lokalnie, łamie w prod" pułapek niż workerd, (d) brak znanych blocking Astro 6 + React island bugów na Functions runtime. Koszt: ~0.5-1 dnia migracji adaptera + przepisania CLAUDE.md. **Trigger do swapu**: jeśli w pierwszym tygodniu implementacji któryś z otwartych Astro 6 + workerd bugów (#16387/#16529/#15411) zablokuje SSR auth flow i nie znajdzie się workaround w 1 wieczór — Netlify jest pre-validated fallbackiem.

#### 3. Vercel

Mocne tooling (`llms-full.txt`, Fluid Compute GA, scriptable CLI). Schowany na trzecie miejsce przez **non-commercial clause na Hobby Plan** (jakakolwiek monetyzacja TablePlanner w przyszłości wymusza Pro $20/seat/mo) i **MCP w statusie Beta** (sprawdzone 2026-06-14). Nie jest pre-validated fallbackiem — wybór Vercela wymagałby ponownego cross-checku.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Otwarte bugi Astro 6 + React islands + workerd są blocking risk dla deadline'u 2026-07-05.** Konkretnie: `react-dom/client` SyntaxError na hydratacji (#16387), Invalid hook call w React island (#16529), `cloudflare:workers` ESM URL scheme breaks (#15411), Windows `Invalid URL` path serialization (#16114). Solo developer z 3 tygodniami after-hours dostaje raz takiego buga w środku tygodnia i traci 2 wieczory na workaround — to 15% czasu na MVP.
2. **`@astrojs/cloudflare` v13 wyrzucił Pages support — to świeża migracja w samym adapterze.** Stack jest pinned na bardzo świeży kontrakt (Workers Static Assets via `wrangler deploy`, nie `wrangler pages deploy`). Każdy outdated tutorial / Stack Overflow odpowiedź pokazuje stary flow. AI agent ma dużą szansę zgenerować przestarzałą komendę z `pages deploy` i developer odkryje to dopiero przy CI failure.
3. **CVE-2025-58179 i CVE-2025-65019 na `@astrojs/cloudflare`.** Solo developer musi *aktywnie* utrzymywać patch level adaptera — security z definicji nie jest częścią MVP scope, ale tu jest na hot pathu.
4. **`workerd` ≠ Node. `npm run dev` (Vite/Node) ≠ `npm run preview` (workerd).** CLAUDE.md sam to ostrzega ("bindings declared in `wrangler.jsonc` are inactive [in dev]"). Cały Supabase SSR cookie flow działa w dev, ale może się rozjechać w preview lub produkcji. Solo MVP nie ma czasu na debugowanie różnic runtime'u.
5. **Single-region (Polska) NIE jest mocną stroną Cloudflare.** Edge to siła Cloudflare, ale Q4 wybrał „jeden region" — więc płacimy złożoność runtime'u workerd (10ms CPU limit, brak pełnego Node API, stricter Vite dep optimizer) za przewagę, której nawet nie wykorzystujemy.

### Pre-Mortem — How This Could Fail

Jest 5 października 2026, trzy miesiące po wdrożeniu. Operator pary młodej zalogowała się 28 września wieczorem, by dodać 12 ostatnich gości i sprawdzić sąsiedztwa. Aplikacja zwróciła błąd 500 — drag-and-drop React island przestał działać po deploy'u, który był drobnym patchem do Tailwind config. Patrząc wstecz, ta katastrofa była zbudowana z czterech kroków. Pierwszy: solo developer zignorowała otwarte issue #16529 z lutego 2026, bo „pojawia się tylko czasem". Drugi: deadline 5 lipca zmusił do zamknięcia MVP bez E2E testów (kosztu na które nie było czasu) — wszystkie błędy hydratacji były wyłapywane manualnie. Trzeci: `wrangler deploy` w CI z `nodejs_compat` przeszedł, ale `Astro.locals.runtime` access pattern zmieniło się w v14 adaptera i auto-update Dependabot we wrześniu rozjechało to z `src/middleware.ts`. Czwarty: brakowało plików `.dev.vars` z prawdziwymi Supabase URL w E2E, więc nikt nie zobaczył błędu przed produkcją. Operator wesela 12 października uruchomiła awaryjny Excel.

### Unknown Unknowns

- **`Astro.locals.runtime` API zostało wyciągnięte w v13 adaptera** — env vars czyta się teraz `import { env } from 'cloudflare:workers'`. Większość tutoriali w sieci (włącznie z oficjalnymi blog postami) pokazuje stary pattern. Kod generowany przez AI agenta z dużym prawdopodobieństwem użyje przestarzałego API.
- **Cloudflare Pages → Workers Static Assets migration jest „absorbcja", nie „deprekacja"** — Pages dashboard, deploy hooks, preview deployments dalej działają, ale wszystkie *nowe* feature'y wchodzą tylko do Workers. Mental model „deploy na Pages, używam Workers gdy potrzeba" już jest fałszywy.
- **Vite dep-optimizer + workerd są stricter niż dev na Node.** Zależności typu `bcrypt`, `pg`, części `@supabase/ssr` mogą działać w `npm run dev` (Node) i wybuchnąć w `npm run preview` (workerd). Test integracyjny *musi* być na workerdzie — jeśli developer testuje tylko `npm run dev`, błędy znajduje dopiero w prod.
- **Workers free 100k req/day jest *na konto*, nie na worker.** Jeśli developer rozdrobni MVP na kilka workerów (auth, api, ssr) — limity dzielą się na wszystkie.
- **Cloudflare MCP servers wymagają OAuth każdorazowo przy `claude mcp add` — nie są one „włączone" w `.claude/settings.json`.** Trzeba przejść interactive auth flow. Solo developer może odkładać setup MCP w nieskończoność, w praktyce wracając do `wrangler --help`.

## Operational Story

- **Preview deploys**: każdy `wrangler deploy` z brancha generuje **versioned preview URL** (`<version-id>-<worker-name>.<subdomain>.workers.dev`). Versioned uploads (`wrangler versions upload`) tworzą preview bez nadpisywania produkcji — używaj tego w PR pipeline. Preview URLs są publicznie dostępne domyślnie; ochrona przez **Cloudflare Access** (zero-trust gate) jeśli preview zawiera dane testowe. PR z forków: workflow w `.github/workflows/ci.yml` musi explicit nie ujawniać secrets dla forked PRs (`secrets.SUPABASE_KEY` nie dostępny dla untrusted contexts).
- **Secrets**: env vars w **dwóch warstwach**. Public (build-time + non-secret runtime): `[vars]` block w `wrangler.jsonc`. Secret (`SUPABASE_KEY`): `wrangler secret put SUPABASE_KEY` (zapis w Workers Secrets, encrypted at rest, nie wyświetla się w logach ani w `wrangler tail`). Read access: tylko Cloudflare account members z `Workers Edit` permissions. Rotation flow: `wrangler secret put SUPABASE_KEY` (nadpisuje) → `wrangler deploy` (re-bind). **Lokalnie**: `.dev.vars` w gitignore, mirror środowiska produkcyjnego dla `npm run preview` na workerdzie. **`SUPABASE_URL` może iść do `[vars]`** (nie jest sekretem), ale per CLAUDE.md zostań przy `wrangler secret` dla obu — uniform pattern.
- **Rollback**: `wrangler rollback [VERSION_ID]` — atomic, ~5s. Lista wersji: `wrangler deployments list`. Bez argumentu rollbackuje do poprzedniej. Caveat: Supabase migrations *nie* rollbackują się z aplikacją — separate `supabase db push` revert wymagany manualnie (uważać przy schema-breaking changes pre-wesele).
- **Approval**: `wrangler deploy` **leci od razu na produkcję** — brak draft-by-default safety net (kontrast z Netlify). Per `ci_default_flow: auto-deploy-on-merge` z tech-stack: produkcja deployuje się **wyłącznie przez merge do `main`** (GitHub Actions wykonuje `wrangler deploy`), ręczny `wrangler deploy` z lokalnej maszyny **zabroniony** (reguła do dopisania w CLAUDE.md). Akcje wymagające ludzkiej ręki: rotacja `SUPABASE_KEY`, usunięcie workera, zmiana planu (paywall), Supabase RLS policy changes, Cloudflare API token rotation.
- **Logs**: `wrangler tail` (real-time runtime tail, filtry `--status`, `--search`, `--format json`, sampling przy heavy traffic). `wrangler deployments status` — diff vs poprzednia wersja. Workers Observability MCP (`claude mcp add cloudflare-observability ...`) — structured tool access do logów. Pipeline logs: standard GitHub Actions output z `wrangler deploy --dispatch-namespace=production`. CVE & advisory tracking: subscribe na GitHub Security Advisories dla `@astrojs/cloudflare`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Otwarte Astro 6 + React island + workerd bugi (#16387, #16529, #15411, #16114) blokują implementację w środku sprintu | Devil's advocate | H | H | Day-1 smoke test: deploy minimal Astro 6 + React island + Supabase SSR auth flow na `wrangler dev` **i** `wrangler deploy` w sandbox worker; jeśli któryś bug trafia — przełącz na runner-up (Netlify) w ciągu jednego wieczoru, plik `infrastructure.md` mark stale |
| CVE-2025-58179 / CVE-2025-65019 na `@astrojs/cloudflare` — patch level drift | Devil's advocate | M | M | Pin `@astrojs/cloudflare` do konkretnej patch-zero-CVE wersji w `package.json` (NIE `^` ani `~`); subscribe do GitHub Security Advisories; sprawdź `npm audit` raz/tydzień; **NIE** używaj Dependabot auto-merge dla tego pakietu |
| `Astro.locals.runtime` API zmieniło się w v13 — AI agent generuje przestarzały kod z tutoriali | Unknown unknowns | H | M | W CLAUDE.md jasna reguła: env vars czyta się **wyłącznie** przez `import { env } from 'cloudflare:workers'`, **nigdy** przez `Astro.locals.runtime`; dopisz przykład w sekcji Environment |
| `npm run dev` (Vite/Node) ≠ `npm run preview` (workerd) — silent prod regressions | Devil's advocate + Pre-mortem | H | H | **Reguła w CLAUDE.md**: każda zmiana auth flow / Supabase SSR / cookie handling musi być przetestowana na `npm run preview` przed PR-em, nie tylko `npm run dev`; CI `.github/workflows/ci.yml` powinno mieć osobny job `preview-smoke-test` |
| `wrangler deploy` od razu na produkcję — brak natywnego safety net | Operational gap | M | H | Lokalny `wrangler deploy` **zabroniony** (zapisać w CLAUDE.md); produkcja **wyłącznie** przez merge do `main` + GitHub Actions; consider `wrangler versions upload` + manual promotion via `wrangler deployments` dla high-risk releases |
| Vite dep-optimizer + workerd stricter niż Node — `@supabase/ssr` lub deps mogą wybuchnąć w preview | Unknown unknowns | M | H | Pin dokładne wersje `@supabase/ssr` i `@supabase/supabase-js` (no `^`); test `wrangler dev` + `wrangler deploy` w sandbox po każdej aktualizacji Supabase deps |
| Auto-update Dependabot rozjeżdża adapter v13 → v14 mid-sprint | Pre-mortem | M | M | Disable Dependabot auto-merge dla `@astrojs/cloudflare`, `astro`, `wrangler`, `@supabase/*`; tylko ręczne PR review |
| Cloudflare MCP wymaga interactive OAuth — w praktyce nie istnieje dopóki nie skonfigurowany | Unknown unknowns | M | L | Day-1 setup: `claude mcp add cloudflare-workers ...` + `claude mcp add cloudflare-observability ...` + scoped Cloudflare API token (Workers Edit + Account Read tylko, bez DNS, bez billing) |
| Workers free 100k req/day jest per-account nie per-worker | Unknown unknowns | L | L | Nie rozdrabniaj MVP na multi-worker (jeden worker dla całego SSR + API); monitor `wrangler tail` dla request count |
| Supabase migrations nie rollbackują się z `wrangler rollback` | Operational reality | M | H | **Reguła w CLAUDE.md**: schema-breaking Supabase migrations mergeowane do `main` **wyłącznie** po włączeniu maintenance window; nigdy w tygodniu poprzedzającym oczekiwane użycie produkcji (np. tydzień pre-wesele) |
| Cloudflare API token w GitHub Actions secrets — scope leak ryzyko | Security baseline | L | M | Token zakresowany do **jednego workera** + Account Read; bez DNS, bez Workers Secrets cross-account, bez billing; rotate co 90 dni; **NIE** commituj `.dev.vars` |
| Single-region (Polska) — Cloudflare edge przewaga niewykorzystana | Devil's advocate | (informational) | L | Akceptowalne — koszt złożoności workerd jest balansowany przez zero-migration-cost i $0 koszt; jeśli kiedyś projekt urosnie globalnie, edge zarazem już jest tu |

## Getting Started

Wszystkie komendy zweryfikowane przeciw konkretnym wersjom w `tech-stack.md` (Astro 6, `@astrojs/cloudflare` v13.x, npm, Node 22.14.0 per `.nvmrc`). Reguła guardrail #8: nie kopiuj komend z generic Cloudflare docs bez walidacji — Pages→Workers migration zmieniła canonical flow.

1. **Zweryfikuj że nie ma drift'u w adapterze:**
   ```bash
   npm ls @astrojs/cloudflare wrangler
   npm audit --production
   ```
   `@astrojs/cloudflare` powinien być **v13.x**. Jeśli widzisz `pages deploy` w jakimkolwiek scripcie — to artifact starego flow, do usunięcia. `package.json` powinien używać `wrangler deploy` w deploy scripcie, nie `wrangler pages deploy`.

2. **Załóż Cloudflare account + Workers subdomain** (manual step — przez UI, nie agent):
   - Loguj się na dash.cloudflare.com → **Workers & Pages** → zaakceptuj `<your-name>.workers.dev` subdomain.
   - **Account Home → API Tokens → Create Token → Custom token**: scope = `Account / Workers Scripts / Edit` + `Account / Account Settings / Read`. **Bez** DNS, **bez** billing, **bez** Workers Secrets dla innych workerów. Zapisz token bezpiecznie.

3. **Wrangler local auth + project link** (jednorazowo):
   ```bash
   npx wrangler login
   npx wrangler whoami
   ```
   Zweryfikuj że `wrangler.jsonc` ma `name = "table-planner"` (lub matching project name) i `main = "./dist/_worker.js/index.js"` (Astro 6 SSR entry).

4. **Skonfiguruj secrets** (NIE wchodzą do repo):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Lokalnie: `.dev.vars` (gitignore'd, mirror produkcji) — wymagane dla `npm run preview` na workerdzie.

5. **Day-1 smoke test pre-merge** (krytyczny — adresuje top risk z register):
   ```bash
   npm run build
   npm run preview
   ```
   W przeglądarce: zaloguj się, dodaj testowego gościa, zweryfikuj że React island (drag-and-drop) hydratuje bez błędów w DevTools console. **Jeśli widzisz `react-dom/client` SyntaxError, Invalid hook call, lub `cloudflare:workers` ESM URL error** → znana klasa bugów (#16387/#16529/#15411). Sprawdź czy issue jest closed na konkretnej patch wersji adaptera; jeśli nie → SWAP na runner-up (Netlify) w ciągu jednego wieczoru.

6. **CI deploy do produkcji** (per `ci_default_flow: auto-deploy-on-merge`): GitHub Actions w `.github/workflows/ci.yml` musi mieć job `deploy-production` triggered na push do `main` z `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` repo secrets, plus wszystkie Supabase env vars. Pierwsza produkcja: merge minimal placeholder do `main`, zweryfikuj green CI, otwórz URL `https://table-planner.<subdomain>.workers.dev`, potwierdź że `/auth/signin` renderuje.

7. **(Opcjonalnie, ale rekomendowane) Setup MCP** po pierwszym udanym deploy'u:
   ```bash
   claude mcp add cloudflare-workers-bindings -- npx -y mcp-remote https://bindings.mcp.cloudflare.com/sse
   claude mcp add cloudflare-observability -- npx -y mcp-remote https://observability.mcp.cloudflare.com/sse
   claude mcp add cloudflare-docs -- npx -y mcp-remote https://docs.mcp.cloudflare.com/sse
   ```
   Wymaga OAuth flow per server (interactive jednorazowo). Daje structured access do env/secrets management, runtime logów i agent-readable docs zamiast scrapowania `wrangler --help`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Workers nie używa kontenerów — irrelevant dla tego stacku)
- Pełne CI/CD pipeline setup (auto-deploy on merge konfiguruje się w `.github/workflows/ci.yml`; szczegóły implementacji workflow poza scope'em research'u)
- Production-scale architecture: multi-region failover, SLA commitments, dedicated support tiers, Durable Objects state design, KV/R2/Queues integration (PRD `target_scale.users: small`, `qps: low` nie uzasadnia)
- Custom domain + SSL (Cloudflare załatwia automatycznie, ale konfiguracja domeny weselnej.pl jest decyzją produktową)
- Disaster recovery / backup strategy dla Supabase (osobny skill, osobny risk register)
- Cloudflare Pages migration path (nieaktualne — `@astrojs/cloudflare` v13 wyrzucił Pages support, jedyna ścieżka to Workers Static Assets)
