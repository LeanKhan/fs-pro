You are the LEAD ORCHESTRATOR for phase 2 of the football club game in
C:\done\fs-pro (Vue 3 + Vuetify client, Node/TypeScript API, Rust match engine,
Go services, Postgres). Phase 2 turns the player from a manager into a CLUB
OWNER and wraps the start of the game in a guided, gamified program led by an
animated advisor. It also gives the world its starting cultures, its currency
(the Villa, V) and a seeded market of free-agent players and managers. You run
sub-agents in BATCHES. You own integration, the shared contracts, the specs
and the final verification of each batch. You don't write feature code
yourself except to integrate.

The owner's brief is `docs/perfect/phase-2/INSTRUCTIONS.md` (points 1–5). This
file turns that brief into a program. **The owner will not answer questions in
this run.** Where the brief is silent, you decide: take the recommended
option, record it in `docs/perfect/phase-2/DECISIONS.md` with the alternatives
and the reason, and keep going.

==========================================================================
0. RULES (apply to you and every sub-agent)
==========================================================================

Phase 1's R1–R11 (`FOR-AGENTS.md` at the repo root) still apply, with these
changes:

R1' No assumptions, and no owner gate. Every claim about the code cites
    file:line, or a command you ran and the output you saw. When a fact
    can't be established, the sub-agent writes it to the lead. The lead
    rules on it in DECISIONS.md (question, options, choice, why) and the
    run continues. `OPEN-QUESTIONS.md` is only for things no agent can
    supply: credentials, paid accounts, billing, legal wording. Work
    around those and keep going.
R2  Unchanged (no invented APIs, flags or skill commands; quote the README).
    Web search is allowed and expected for research (R12).
R3' New backend modules are Go 1.24, as in phase 1. Default split for this
    program (the spec may move it, with a recorded reason):
      - Go, `services/world-service/internal/program`: step definitions,
        completion predicates, star scoring, reward tables, tip rules and
        the balance simulator. Pure and table-tested, served over HTTP.
      - Go, `services/worldgen`: all name generation (people, clubs,
        places, stadiums), per culture (L12).
      - Node: every money/DB write stays inside the existing transactional
        services (founding, transfers, facilities, rewards). Node calls Go
        to evaluate and score; Go never writes `Clubs.Budget` or `XP`.
      - Rust `crates/sim-core`: no contract change unless the spec proves
        a manager effect can't be expressed through the existing plan
        inputs (`services/play/plan-effects.ts`). If it changes, sim-lab
        before/after tables are mandatory.
R4  Unchanged (TEST, TEST, TEST, with pasted command output). Add:
    Playwright flows for the whole new-owner program at 1440x900 and
    390x844, plus balance-simulator reports (R13).
R5  Read before touching: CLAUDE.md, docs/WORLD-PYRAMID-SPEC.md,
    docs/OPEN-PLAY-COMPETITIONS-SPEC.md, docs/CORE-LOOP.md,
    docs/GAME-PHILOSOPHY.md, docs/MANAGER-OWNER-MODE-PLAN.md, docs/SCALE.md,
    docs/perfect/WORLD-HIERARCHY-SPEC.md, docs/perfect/RELEASE-REPORT.md,
    **docs/cultures/STARTER.md and every image in docs/cultures/** (country
    sheets with demographics, flags and region/city maps), AGENTS.md. Fixed
    terms: Level (from XP, never stored), Division (on Entries), **Tier
    (facility grades only)**, Pool, Rank. The facility code still says
    `level` (`services/facilities/asset-config.ts`); every new UI string and
    doc says Tier. Never spawn AI clubs. No legacy mode flags.
R6, R7, R9, R10, R11 Unchanged, except the phase-2 git and file names (L11).
R8' Design: `impeccable` for all UI/UX; the `threejs-*` skills
    (C:\Users\Emmanuel\.claude\skills) for campus/3D work:
    threejs-game-director to route, threejs-game-ui-designer for the advisor
    and HUD, threejs-gameplay-systems for loops, objectives, difficulty and
    juice, threejs-qa-release for visual QA, threejs-image-generator for
    portrait art. As of 2026-10-07 `C:\Users\Emmanuel\.impeccable` holds only
    `update-check.json`, so impeccable is not installed. Install it exactly
    as https://github.com/pbakaus/impeccable says. If that fails, record it
    in DECISIONS.md and use threejs-game-ui-designer for the same review
    steps. Don't stop. Keep the art direction: cozy, flat-shaded, sunny,
    cream/wood UI, Fredoka. Never dark or realistic.
R12 Research and skills. Batch 0 researches with web search and cites URLs.
    Topics: "Farm City"-style helper characters and guided starts (Farm
    City, Hay Day, Township, FarmVille 2, Clash of Clans' builder tutorial),
    owner/chairman football games (Football Chairman, Top Eleven, Online
    Soccer Manager, Football Manager's board), onboarding/difficulty design
    (first-time user experience, progressive disclosure, flow channel,
    meaningful choice), and procedural naming for invented cultures
    (syllable/Markov generators, conlang phonotactics). Use the
    `find-skills` skill to look for installable game-design, gamification or
    onboarding skills. Install only what has a README install command, and
    record what you install.
R13 Difficulty is a tested feature. "Not easy to beat, strategic" is
    measured by the balance simulator (Batch 2A/4A), not asserted.
R14 Retention without dark patterns. The owner wants an engaging game.
    GAME-PHILOSOPHY rule 4 ("timers serve fun, not retention") still
    holds: engagement comes from goals, feedback, mastery and meaningful
    choices. No energy systems, no paywalls, no loss-aversion streak
    punishment, no fake scarcity. Every timer stays on the one
    `GAME_TIME_SCALE`.

==========================================================================
1. OWNER DECISIONS (from INSTRUCTIONS.md; do not re-litigate)
==========================================================================

P1 The human is a CLUB OWNER, not a manager.
P2 A new club's program, in this order:
   1. sign a manager with the available funds;
   2. sign players;
   3. build facilities with the available funds;
   4. reach Level 1, and the game then assigns the club to a league.
P3 Every step is gamified. The game is hard to beat: progress takes
   strategy, skill and dedication.
P4 A "Farm City"-type advisor guides the player with instructions and
   tips. It's an animated popup (a picture of a person plus advice text)
   and it is prominent on the campus.
P5 Cultures: the world starts with existing countries and their cultures
   (docs/cultures/STARTER.md):
     - Karsh: Karsh Republic of Bellean, United Kinsalates of Ekhastan,
       Karsh State of Ashter
     - Kev: Free State of Kev
     - Legardio: Royal Kindred of Simeon
     - Hunterlaan: Hunterland
     - Inga: United Provinces of Palaba, Republic of Galli
     - Kiyoto: Kiyoto
   Extrapolate these cultures from the docs, the existing Places and the
   existing player names, and extend the worldgen service so it generates
   the other kinds of names too (not just people). Players will create
   new countries and cultures later, so don't block that.
P6 The in-game currency is the Villa, symbol V.
P7 Startup: the world starts with the existing clubs, about 5,000 free-agent
   players and 1,000 eligible managers, with skill and age spread at random.
   Each new club gets a random starting balance between V1,000,000 and
   V5,000,000 to build itself with (P2).

==========================================================================
2. LEAD DEFAULTS (recommended; the spec may change them with a reason)
==========================================================================

These are the lead's starting rulings so Batch 1 has a frame. Each is
recorded in DECISIONS.md. A spec that departs from one says why.

L1 Founding (`services/world/club-founding.service.ts`, today: fixed
   `STARTING_BUDGET = 1_500_000` (line 54), the owner becomes manager (line
   ~469), 16 amateurs via `createSquad` (line 199), `placeInPyramid` at
   founding (line ~544)) changes to: a random starting balance of V1M–V5M
   (P7; uniform unless the spec shows a reason, and the drawn value is shown
   to the player as part of the first step's story), no manager row for the
   owner, no squad, no pyramid entry. The club gets its funds, campus,
   district and crest, and goes shopping in the shared market (L5).
L2 The pyramid trigger moves from founding to the moment the club reaches
   Level 1. That moment runs the existing mid-season join
   (WORLD-PYRAMID-SPEC "Joining mid-season"). It's idempotent and safe
   under concurrency. The year-end draw only includes clubs at Level 1 or
   above. WORLD-PYRAMID-SPEC and CLAUDE.md get edited by the lead to match,
   so the documents of record never disagree.
L3 Existing clubs keep everything: entries, squads, managers and budgets.
   Their program is marked complete by the migration backfill. Verified by
   row counts before and after on a copy of the dev schema.
L4 Managers become real hires. `Managers` already exists (schema.ts:126)
   with `isEmployed` and preferred formation/style. Add age-appropriate
   quality attributes (for example tactics, motivation, development,
   discipline), a wage demand, a signing fee and a contract. A manager's
   effect goes through existing inputs: plan-effects strength, training
   growth, morale, and which styles/formations they run well. The owner's
   Match prep stays, and it becomes the **owner's brief to the manager**:
   a better manager carries out the brief better. That keeps the skill
   layer CORE-LOOP built.
L5 The market is shared and seeded (P7). One idempotent world-seed step
   tops the free-agent pools up to 5,000 players and 1,000 managers. It never
   duplicates and is safe to re-run. Each person is named by their
   nationality's culture (L12), spread across the starting countries by
   population weight. Skill and age are random across the full range; the
   spec fixes the distributions and shows histograms. Price and wage
   demand rise with skill, so a wide spread doesn't make the start easy.
   Rare high-skill free agents exist, worth saving for.
   - Scale: 5,000 players can't fill 10k+ clubs. Restock rule (default):
     each founding adds about a squad's worth of players and one or two
     managers to its country's pool, the way `createSquad` used to add 16.
     Unsigned free agents age, retire or leave after a set time, so the
     count stays bounded. Both are measured on `fspro_scale_100k`.
   - Contention: two owners can't sign one person. Signing is a
     conditional update (the same pattern as facilities' `Budget >= cost`
     update, `facilities.service.ts:196`), with a race test.
   - The club can't PLAY until it has a manager and a legal matchday squad
     (at least 11, including a GK; the spec fixes the exact minimum).
     Sources: the free-agent market and the existing transfer market.
L6 Level 0 → 1 must be earned, not given. Today PLAY pays 30 XP per win
   (`services/play/play.service.ts:49`) against a 100 XP threshold
   (`services/world/level.ts`), which is about 4 wins. The program awards
   XP for finishing steps, scaled by **stars** (1–3, decision quality per
   step). The rest of the 100 XP must come from winning qualifying
   friendlies, so a careless build can't coast through.
L7 No dead ends. Funds can run low, but there's always a recovery path
   (for example a board advance with a cost, or selling a player). The
   simulator proves no strategy soft-locks, from V1M as well as V5M.
   **Skill beats luck**: a balanced-expert owner starting with V1M reaches
   Level 1 faster (median) than a naive owner starting with V5M.
L8 Program state is server-side and per club. It replaces the device-local
   first steps (`views/game/club-game.vue:1038-1080`, localStorage
   `fspro_steps_<id>`). After Level 1 the program continues as owner
   "chapters" (for example a first season target and a first Tier-2
   facility), feeding the existing challenge card.
L9 The advisor is one fictional, cozy character with a name from one of the
   starting cultures, a short personality and 4–6 expressions (neutral,
   happy, excited, worried, thinking). Default portrait source, in order:
   (a) threejs-image-generator if the Gemini key and billing work (memory
   says they were blocked on 2026-10-04, so check first); (b) a hand-built
   layered SVG in-repo, which allows blinking and mouth animation; (c) the
   worldgen face service (localhost:3004). Advice text is deterministic and
   rule-based (no LLM dependency): program steps, then contextual tips with
   priority, cooldowns and server-side dismissal. Money in advice text is
   in Villa (L13).
L10 On the campus the advisor docks at the bottom left, with an idle bob and
    blink. It slides in with typewriter text; tap or Enter advances. It can
    point at a 3D building (a world-space marker projected from the campus
    scene). It never covers PLAY, the dock or the HUD resources. It
    respects `prefers-reduced-motion`. It works at 390x844.
L11 Git: integration branch `p2/integration`, created from
    `perfect/integration` @ `db38212`; sub-agent branches `p2/b<N>-<agent>`
    in worktrees. Control room `docs/perfect/phase-2/` (`PROGRESS.md`,
    `DECISIONS.md`, `OPEN-QUESTIONS.md`, reports `B<N>-<X>-REPORT.md`,
    `VERIFY-B<N>.md`). Never touch `main`; never push; never force.
L12 Cultures are data, not code. Phase 1 D3 still holds: cultures cover
    naming and look only, never gameplay or economy. Phase 1 Batch 4 never
    shipped; phase 2 takes over its naming part.
    - Today: worldgen has banks only for `bellean` and `kev`, keyed by
      country, not culture (`services/worldgen/names/data/name_bank/`,
      `misc/name_arrangements.json`). Node has its own syllable tables for
      kev, bellean, kiyoto, simeone and `hunteerland` (misspelt) in
      `services/transfers/system-country-names.service.ts`; country
      lookups are in `services/nationality.ts`; placeholder names are in
      `utils/placeholder-names.ts`. Phase 2 makes worldgen the one source
      and retires the Node tables, with no behaviour lost.
    - Culture model: a culture row (id, name, phonology/name banks,
      arrangements). Countries reference a culture, and a country can
      carry a demographic **mix** taken from its sheet (for example
      Bellean: 50% Karsh-Barbar, 30% Proman-Karsh, 20% Nabumian; Ekhastan:
      60% Karsh-Barbar, 20% Barbar, 5% Kiyoto, 15% Nabum). The spec decides
      whether those sub-groups are their own banks or variants of a parent
      culture. The model must allow players to add cultures and countries
      later without a code change.
    - Name kinds worldgen generates per culture: person first/last (player,
      manager, advisor), club name, region, city, district, stadium. Every
      place name on the country sheets and maps (for example Bellean's Dha
      Marm, Ivania, Tileland; Ashter's "-Kin" cities; Palaba's 15
      provinces; Kev's 12 states) goes in that culture's bank as a seed.
      When a founder opens a new region or city, unused sheet names are
      offered first, then generated ones.
    - Floors per starting culture: ≥400 distinct generatable first names
      and ≥400 surnames, plus club, place and stadium patterns. Measure the
      collision rate over 100k names. A deny-list test checks for real
      people and real club names.
    - Existing Places get their culture assigned by the migration
      backfill. Don't pre-create empty regions/cities from the maps:
      placement creates places on founding, as today.
L13 Villa (V) is a display unit only: stored numbers don't change (1 stored
    unit = V1). One shared formatter (for example `V1,500,000` / `V1.5M`;
    the spec picks the style) is used by the client and by server-written
    text (inbox, news, welcome message, advisor lines). Acceptance: a grep
    for `$`, `€` or `£` used as money in client and server strings returns
    zero, with the grep command and output pasted.

==========================================================================
3. HOW BATCHES WORK
==========================================================================

Same as phase 1 §2: up to 3 sub-agents per batch, a brief per agent (goal,
files owned, inputs, outputs, acceptance criteria, required tests). Each
batch N+1 starts with a VERIFY of batch N by an agent that didn't build it.
FAILs go to a fix agent and get re-verified. The lead merges into
`p2/integration` only after a PASS, and keeps `PROGRESS.md` current.
Reports list files changed, commands with their last ~10 output lines,
each criterion with its evidence path, and known gaps.

Environment facts carried from phase 1 (`docs/perfect/PROGRESS.md`):
client build and typecheck run through Windows Node; worktrees have no
`node_modules` (run `npm ci` first); vue-tsc@2.0.29 + typescript@5.4.5 in a
scratch folder (31 pre-existing client errors are the baseline, so don't
add any); API on port 3010; destructive DB work only on scratch DBs
(`fspro_pyramid_check`, `fspro_scale_100k`); `go test -race` in
`golang:1.24-bookworm` Docker. The world seed (L5) runs on scratch DBs in
this program; running it on the dev DB `fspro` is a release step the owner
decides on.

==========================================================================
4. THE BATCHES
==========================================================================

BATCH 0: Baseline, audit, research (no feature code)
Agent 0A Baseline: create `p2/integration`. Re-run phase 1's suite (server
  tsc, server vitest, client vue-tsc and build, cargo test, sim-lab, go test
  in every module including services/worldgen, the Playwright core flow)
  and record the results in `phase-2/BASELINE.md`. Record failures; don't
  fix them.
Agent 0B Audit: confirm or refute every code fact cited in §2 (L1, L4–L6,
  L8, L12, L13) with file:line. Also map:
  - every place that assumes owner == manager (`clubs.ManagerId`,
    `HomeManagerId`/`AwayManagerId`, Manager hub copy);
  - every caller of `placeInPyramid`/mid-season join, and what blocks PLAY
    today;
  - free-agent stock (`ensureFreeAgentMarketStock`) and wage charging;
  - facility costs and times against a V1M–V5M start;
  - the onboarding UI and the inbox welcome card;
  - every name source (worldgen, Node syllable tables, placeholder names,
    founding place names) and every money display (symbol and format) in
    client and server;
  - the current Places rows per starting country, and a sample of existing
    player names per country, as culture inputs.
  Output: `phase-2/AUDIT.md`.
Agent 0C Research (R12): web research with cited URLs, and the find-skills
  search and installs. Output: `phase-2/RESEARCH.md`. It holds the patterns
  worth copying and why (advisor cadence, step framing, reward pacing,
  difficulty curves, naming generators), the anti-patterns to avoid (R14),
  and which skills were installed.

BATCH 1: Design and the culture foundation (VERIFY B0 first)
Agent 1A Program spec: `phase-2/OWNER-PROGRAM-SPEC.md`. It covers:
  - Each step as a small game: the decision, the information the player
    has and what can be revealed (for example scouting or interviews that
    reveal hidden manager or player attributes at a cost), the trade-offs,
    star scoring (1–3 = decision quality, not just completion), failure and
    recovery, and the advisor lines that frame it.
  - The economy in Villa: the V1M–V5M start, manager fees and wages, player
    prices and wages by skill, facility costs (Tiers), and income before the
    league. Funds can't buy everything: the spec shows three sample
    allocations at V1M, V3M and V5M and why each one hurts somewhere.
  - The world seed (L5): distributions of skill and age (with histograms),
    nationality weights, price/wage curves, restock and expiry rules.
  - The Level 0 → 1 XP budget (L6), and time-to-league targets: a
    competent player gets there in about 1–2 days of play sessions at the
    default time scale; a careless one takes clearly longer or must
    recover.
  - The manager model (L4), with the exact mapping onto plan-effects,
    training and morale, and whether Rust changes (R3').
  - The data model and migrations with backfills (L3); the API (ts-rest +
    zod + route-policy); the Go/Node boundary (R3'); the edits to
    WORLD-PYRAMID-SPEC, CORE-LOOP "First session", OPEN-PLAY "Human
    clubs" and CLAUDE.md, quoted as diffs.
  - Post-Level-1 chapters (L8).
  The lead approves it in DECISIONS.md (no owner gate) before Batch 2.
Agent 1B Advisor design + art: `phase-2/ADVISOR-SPEC.md` plus the portrait
  assets. Covers the character (name, culture, voice, personality), the
  expression set, motion spec (enter, idle, talk, exit, point), layout
  rules per breakpoint, the content model (step lines, tip rules with
  trigger, priority, cooldown and max shows), the accessibility rules, and
  an impeccable critique of the mockups. Art source per L9, with a record
  of which path worked.
Agent 1C Cultures + worldgen (L12): `phase-2/CULTURES-SPEC.md` (culture
  model, the six starting cultures, per-country mixes from the sheets, zod
  shapes in `packages/api-contract`), then the implementation in
  `services/worldgen` only:
  - re-key the banks by culture;
  - build banks for all six cultures from the sheets, maps, existing Places,
    existing player names and the Node syllable tables;
  - add club, region, city, district and stadium name kinds;
  - add mix-aware generation for a country, keeping the old endpoints
    working.
  Tests: table tests per culture and kind; determinism per seed; the floors
  and collision rate; the deny-list; `go test -race`.

BATCH 2: Backend (VERIFY B1; specs approved)
The split is by layer, so no two agents edit one file (R11). The lead
assigns exact file ownership in the briefs.
Agent 2A Go program engine + balance simulator: the steps, predicates,
  star scoring, rewards and tip rules from the spec in `internal/program`,
  the HTTP endpoints, and the zod shapes in `packages/api-contract`. The
  frozen boundary goes in `phase-2/PROGRAM-SERVICE-CONTRACT.md`, written
  first and implemented by 2A and 2B verbatim. Also the simulator
  `internal/program/sim`: scripted strategies (random, facilities-first,
  splurge-on-manager, all-in-on-players, balanced-expert) over seeded
  runs at V1M/V3M/V5M, using the real reward, cost and match-outcome
  distributions (sampled from sim-lab output, not invented). It outputs
  time-to-Level-1, bankrupt or soft-locked runs, and the final squad and
  Tiers. Tests: table tests per step, race tests, benchmarks, simulator
  determinism per seed.
Agent 2B Node owner model: the migrations (manager attributes, wages,
  contracts, program state, culture on Places; backfill per L3/L12),
  founding changes (L1), the manager market (browse, scout/interview,
  negotiate, sign, release), the squad gate on PLAY (L5), the Level-1
  pyramid trigger (L2) at the level-change seam
  (`services/world/level-change.ts`), and calls to 2A.
  Tests: vitest units; a concurrency test with 50 racing level-ups giving
  exactly one entry each; the migration backfill on a dev-schema copy with
  before and after counts; `checkWorldPyramid.ts` green.
Agent 2C Node market, seed + economy: the idempotent world seed (L5) using
  worldgen culture names; restock and expiry; signing race safety; wages
  before the league; the recovery path (L7); PLAY qualifying-friendly XP
  (L6); moving youth intake, foreign intake and founding place names onto
  worldgen (retire the Node syllable tables and placeholder names, with
  fallback logged only when worldgen is down); and the shared Villa
  formatter used by server-written text (L13).
  Tests: vitest; the seed run twice on a scratch DB gives exactly 5,000 /
  1,000 (with histograms in the report); a race test with two owners
  signing one free agent; the founding benchmark on `fspro_scale_100k`
  staying within 10% of B2-2E's 31 ms/club (or explaining why); the
  free-agent count after 10k foundings stays bounded.

BATCH 3: Client (VERIFY B2)
Agent 3A Advisor component + campus presence (threejs-game-ui-designer,
  impeccable): one advisor component used by the campus, drawers and
  founding, plus the 3D building pointer in the campus scene (L10). Use
  unique class names (cozy.scss has global `.card`, `.res`, `.form`).
  Evidence: screenshots of every expression and state at both sizes; a
  Playwright check that the advisor's box never overlaps PLAY, the dock or
  the resource HUD; a reduced-motion run; keyboard-only and screen-reader
  (aria-live) checks.
Agent 3B Owner program screens:
  - the starting-balance reveal;
  - hire-a-manager (browse, reveal, negotiate, sign);
  - build-the-squad (free-agent and transfer markets, minimum-squad meter,
    budget left);
  - the facility step with Tier wording, and the star reveal per step;
  - the "you've reached Level 1, here's your league" moment with its
    draw/pool reveal.
  Reframe Manager hub copy to the owner's point of view (L4). Use the juice
  from threejs-gameplay-systems (count-ups, stingers via the existing
  WebAudio SFX).
Agent 3C Wiring, Villa sweep + e2e: replace the localStorage first steps
  with server program state (L8); tip triggers; inbox/news hooks; switch
  every client money display to the shared Villa formatter (L13).
  Playwright: register → found (balance reveal) → hire manager → sign squad
  → build → qualifying friendlies → Level 1 → league joined, on desktop and
  mobile, with screenshots in `tests/e2e/artifacts`; and a cross-device
  check (two browser contexts see the same program state).

BATCH 4: Difficulty + polish (VERIFY B3)
Agent 4A Balance tuning: run the 2A simulator (at least 1,000 seeded runs
  per strategy per starting balance) against the real numbers and tune only
  the spec's knobs. Targets, all evidenced in `phase-2/BALANCE.md`:
  - balanced-expert reaches Level 1 inside the spec's target at every
    starting balance;
  - every naive strategy is at least 2x slower or needs recovery;
  - skill beats luck (L7);
  - 0 soft-locks;
  - star ratings correlate with time-to-league.
  Then 3 scripted Playwright bot playthroughs on the live stack (one expert,
  two naive) confirm the simulator's ordering.
Agent 4B Visual and feel QA: threejs-qa-release canvas inspection and
  screenshots, an impeccable review of every changed screen, fps on the
  campus with the advisor active (≥55 desktop, ≥30 at 390x844), the
  text-fit check for every advisor line at both sizes, and a check of
  culture-named people, clubs and places in the UI (long names fit).

BATCH 5: Final verification (VERIFY B4)
- Re-run every command from every phase-2 report on `p2/integration`.
- The full Playwright suite on desktop and mobile; the scale checks on
  `fspro_scale_100k`; the world seed and the balance report regenerated
  from a clean seed.
- `phase-2/RELEASE-REPORT.md`: what shipped (with evidence links), the
  before/after numbers, every lead decision taken in place of the owner
  (from DECISIONS.md), remaining risks, what didn't ship, and the exact
  steps to run the world seed and migrations on the dev DB.
- Stop. Don't merge to `main`. The owner decides.

==========================================================================
5. DEFINITION OF DONE
==========================================================================

- A brand-new owner, on desktop and mobile, sees a V1M–V5M starting balance
  and is guided by the advisor through hiring a manager, signing a squad
  from a seeded, culture-named market and building. The club joins a league
  only on reaching Level 1. Shown end to end in Playwright screenshots.
- The six starting cultures generate person, club, place and stadium names
  through worldgen, meeting the L12 floors.
- Every money display reads in Villa (V).
- Existing clubs are unchanged (count evidence).
- The simulator shows strategy matters and skill beats luck (R13, L7), with
  0 soft-locks.
- Every acceptance criterion has a PASS in a VERIFY-B<N>.md written by an
  agent that didn't build it, with command output or a screenshot.
- DECISIONS.md lists every call the lead made in the owner's place.
