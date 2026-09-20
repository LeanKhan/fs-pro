# FSPro: Autonomous World, Manager Mode & Owner Mode Architecture Plan

## 1. Executive Vision & Architecture Philosophy

FSPro is an **autonomous football world simulator**. Even when a single human player controls one club (or when the server runs unattended with zero players), every club in every league possesses active agency through an **Owner** and a **Manager**.

The architecture decouples **Decision-Making** from **Simulation Execution**:
* **Decision System (The Brains)**: Uses **Jev (TypeSafe AI)**—a fast, non-autoregressive "System One" decision engine returning typed `Choice`, `Score`, and `Noul` primitives based on current game state.
* **Heuristic Filter (The Gatekeeper)**: Eliminates 80–90% of routine AI calls via deterministic rules, reserving Jev calls for high-leverage strategic dilemmas.
* **Game Engine (The Muscle)**: A dual-resolution simulation engine:
  * **High-Fidelity 2D Engine**: Full 22-player spatial grid, ball physics, and tick-by-tick socket replay streaming for matches watched by the human user.
  * **Statistical Quick-Sim Resolver**: Fast Poisson/xG statistical resolution (<5ms per fixture) for background AI vs. AI fixtures, allowing entire matchdays across leagues to resolve in <50ms.
* **Domain Separation**:
  * **Manager Mode**: Tactical mastery, lineup selection, mid-match adjustments, squad harmony, training, and job security (accountable to the Board).
  * **Owner Mode**: Macro-finances (P&L), stadium & facility infrastructure, commercial sponsorships, manager hiring/firing, and club vision (delegates matchday tactics to the appointed Manager).

```text
                  ┌──────────────────────────────────────────────┐
                  │                 WORLD STATE                  │
                  │   (Calendar Day, Standings, Rosters, P&L)   │
                  └──────────────────────┬───────────────────────┘
                                         │
                         Discrete Milestone Trigger
                   (Matchday, Halftime, Window, Board Review)
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │          HEURISTIC GATEKEEPER                │
                  │   Deterministic rules for routine actions    │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
                      Trivial    │                │ Ambiguous /
                     (80-90%)    │                │ Strategic (10-20%)
                                 ▼                ▼
                     ┌────────────────┐   ┌───────────────────────┐
                     │ Internal Code  │   │  JEV (TypeSafe AI)    │
                     │  (0ms, $0)     │   │  System One Decisions │
                     │                │   │  Choice / Score / Noul│
                     └───────┬────────┘   └───────────┬───────────┘
                             │                        │
                             └───────────┬────────────┘
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            EXECUTION SUBSYSTEMS              │
                  ├──────────────────────┬───────────────────────┤
                  │     MATCH ENGINE     │     CLUB ENGINE       │
                  │  • High-Fi 2D Engine │  • P&L Financials     │
                  │  • Quick-Sim Engine  │  • Transfers & Wages  │
                  │                      │  • Stadium & Academy  │
                  └──────────────────────┴───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │              UPDATED WORLD STATE             │
                  │   (Fixtures, Standings, Ledger, Morale)      │
                  └──────────────────────────────────────────────┘
```

---

## 2. Jev (`typesafe.ai`) Decision Mapping

Jev replaces bulky text prompts with typed, calibrated software primitives. Decisions are structured around three core primitives:

### A. Manager Decisions
1. **Halftime Tactical Pivot (`Choice`)**:
   * *State*: Score, minute, man advantage/disadvantage, opponent style, team fatigue.
   * *Question*: `tacticalShift` $\to$ Options: `maintain`, `park_the_bus`, `high_press_overload`, `counter_attack_direct`.
2. **Urgent Substitution Trigger (`Noul`)**:
   * *State*: Player condition (stamina < 40%, yellow card, poor match rating < 5.5).
   * *Question*: `substitutePlayer` $\to$ Probability (0.0 to 1.0). Threshold $\ge 0.70$ triggers sub.
3. **Matchday Squad Rotation (`Score`)**:
   * *State*: Congested schedule (match in 3 days), player fatigue level, opponent difficulty.
   * *Question*: `squadRotationRisk` $\to$ Levels: `full_strength`, `minor_rotation`, `heavy_youth_rotation`.
4. **Individual Training Focus (`Choice`)**:
   * *State*: Player age, role, current attributes, recent form.
   * *Question*: `developmentPriority` $\to$ Options: `Attacking`, `Defending`, `Physical`, `Technical`.

### B. Owner Decisions
1. **Manager Performance Review & Sacking (`Score`)**:
   * *State*: Pre-season expectation, current league position, last 5 matches form, fan sentiment, manager tenure.
   * *Question*: `boardConfidence` $\to$ Levels: `immediate_sacking`, `formal_warning`, `under_review`, `full_backing`.
2. **Transfer Bid Evaluation (`Score`)**:
   * *State*: Bid amount vs. player valuation, player importance (squad status), days remaining in window, replacement available.
   * *Question*: `offerAttractiveness` $\to$ Levels: `reject_outright`, `counter_higher`, `accept_bid`.
3. **Strategic Investment Allocation (`Choice`)**:
   * *State*: Cash balance, stadium utilization rate (sell-outs), youth academy tier, squad wage pressure.
   * *Question*: `capitalExpenditurePriority` $\to$ Options: `expand_stadium`, `upgrade_academy`, `boost_transfer_budget`, `bank_reserves`.

---

## 3. "Little Server" Performance & Resource Strategy

To run an autonomous universe (e.g., 20–100 clubs) on a modest server (1–2 vCPUs, 2GB RAM):

### 1. Dual-Resolution Match Engine (Level of Detail / LOD)
* **High-Fidelity 2D Spatial Engine**:
  * Reserved strictly for matches watched by a human player (or explicitly flagged for live spectating).
  * Runs full 22-player coordinate grid, ball physics, and generates replay frames.
  * Cost: ~500ms–1.5s CPU time per match.
* **Fast Statistical Quick-Sim Resolver**:
  * Used for all background AI vs. AI fixtures.
  * Uses team ratings (GK, DEF, MID, ATT), tactical matchup multipliers, home advantage, and Poisson goal distribution.
  * Computes result, scorers, assists, cards, and player fatigue in **< 5ms** per fixture.
  * An entire 10-match fixture week resolves in under **50ms**.

### 2. Milestone-Driven Decision Ticking (Zero Continuous Polling)
AI agents do not run in continuous tick loops. They activate only on discrete calendar events:
* **Matchday Pre-Game**: AI managers select starting XI and tactics.
* **Halftime (High-Fi only)**: Evaluated if score differential $\ge 2$, red card, or severe injury occurs.
* **Weekly Transfer Pulse**: Clubs review transfer list and squad depth during active transfer windows.
* **Monthly Board Review**: Owners evaluate manager performance and financial cash flow.
* **Season End**: Facility upgrades, contract expirations, and budget adjustments.

### 3. Heuristic Gatekeeping (80/20 Rule)
Before calling Jev:
* Healthy, uncontested starters are automatically picked by heuristic.
* Insultingly low transfer bids (< 60% of player value) are auto-rejected by code.
* Uninjured players with stamina > 80% never trigger sub evaluations.
* Jev is invoked only when code finds an ambiguity score exceeding threshold.

---

## 4. Feature Specifications: True Manager Mode vs. Owner Mode

### A. True Manager Mode
1. **Interactive Team Sheet & Squad Rotation**:
   * Interactive pitch drag-and-drop UI to assign starting XI and 7 bench substitutes.
   * Role and Set-Piece assignments (Captain, Penalty Taker, Free-Kick, Corners).
   * Fitness & Fatigue persistence across calendar weeks.
2. **Tactical System Depth**:
   * Custom instructions: Formation shape, Team Mentality (Defensive, Balanced, Attacking), Pressing Intensity, Defensive Line Height, Tempo, and Width.
3. **In-Match Dugout Controls**:
   * Interactive pause during live match streaming.
   * Mid-match tactic switches (`Game.changeTactic`).
   * Manual substitutions (up to 3 per match) reacting to live game events.
4. **Player Welfare & Morale**:
   * Multi-week injury system (Hamstring, Ankle, ACL) with medical recovery timelines.
   * Player happiness based on playing time, contract status, and club form.
5. **Job Security**:
   * Board confidence meter (0–100%). Sacked if performance drops below tolerance.

### B. True Owner Mode
1. **Manager Delegation**:
   * The Owner hires an AI Manager with distinct tactical philosophy and attributes.
   * The Owner does not pick lineups on matchday; they watch the manager's performance from the Director's Box or quick-simulate matches.
2. **Complete Profit & Loss (P&L) Ledger**:
   * **Inflows**: Ticket sales (attendance $\times$ ticket price), season tickets, TV broadcast contracts, commercial sponsors, merchandise, prize money.
   * **Outflows**: Player and staff wages, stadium maintenance, scouting expenses, academy funding.
3. **Infrastructure Development**:
   * Stadium expansion (Seating tiers, luxury suites).
   * Ticket pricing sliders (dynamic attendance elasticity based on opponent and form).
   * Training Ground upgrades (boosts training attribute progression).
   * Youth Academy upgrades (generates higher-potential youth regens).
4. **Executive Management**:
   * Manager recruitment search, interview evaluation, and contract negotiation.
   * Firing with severance payout requirements.

---

## 5. Phased Implementation Roadmap

### Phase 1: Dual-Resolution Engine & Heuristic Matchday Pipeline
* Build the **Fast Statistical Match Resolver** (`QuickSimResolver.ts`) alongside the existing 2D `Game` engine.
* Add matchday routing: if human is watching, run High-Fi; if autonomous background fixture, run QuickSim.
* Implement the **Interactive Team Sheet** in client (replace auto-pick for human manager).

### Phase 2: Jev Integration & Milestone Decision Service
* Install and configure `@typesafe-ai/sdk` with API key credentialing.
* Build `server/src/services/ai/jev-decision.service.ts` wrapping `Choice`, `Score`, and `Noul`.
* Implement the **Heuristic Gatekeeper** to filter trivial decisions before reaching Jev.
* Implement AI Manager Halftime and Pre-match decision hooks.

### Phase 3: Manager Mode Depth (Tactics, Injuries, Morale)
* Multi-week injury system persisted on `players` schema (`InjuryType`, `WeeksOut`).
* Persistent player condition across calendar days.
* In-match dugout overlay in `matchzone.vue` (pause, sub, change tactic).
* Player morale and board confidence meter.

### Phase 4: Owner Mode & Club Financial Infrastructure
* P&L financial engine (`ClubFinances` table, weekly/monthly cash flow tracking).
* Stadium capacity and ticket pricing mechanics.
* Training Ground and Youth Academy upgrade ladders.
* Owner Mode UI view: Director's Box dashboard, Manager hiring/firing portal.
