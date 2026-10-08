# Phase 2 Research (R12)

**Agent:** 0C (Research) · **Date:** 2026-10-07 · **Repo:** `/mnt/c/done/fs-pro`
**Deliverable:** web research with cited URLs + the `find-skills` search/installs.
**Feeds:** Agent 1A (`OWNER-PROGRAM-SPEC.md`), Agent 1B (`ADVISOR-SPEC.md`), Agent 1C (`CULTURES-SPEC.md`), and the lead's `DECISIONS.md`.
**No owner gate; no feature code. This file contains recommendations, not a spec.**

---

## 0. Scope, method, assumptions

### Questions answered
1. "Farm City"-style helper/advisor characters and guided starts (Farm City, Hay Day, Township, FarmVille 2, Clash of Clans' builder tutorial, Gardenscapes): what makes the advisor cadence, step framing and reward pacing work.
2. Owner/chairman football games (Football Chairman, Top Eleven, Online Soccer Manager, Football Manager's board): how the owner loop differs from the manager loop.
3. Onboarding/difficulty design: FTUE, progressive disclosure, the flow channel, meaningful choice, star ratings as feedback — and the anti-patterns R14 forbids.
4. Procedural naming for invented cultures: syllable/Markov generators, conlang phonotactics, collision control, deny-lists.
5. `find-skills` search for installable game-design / gamification / onboarding skills, and the `impeccable` install status.

### Method
- Targeted web searches; every external claim below carries a URL (R1′, R12).
- File inspection of the already-installed skills so the report grounds advice in the local skill payloads, not just the web.
- `find-skills` skill (present at `~/.claude/skills/find-skills`, symlink to `~/.agents/skills/find-skills`) plus its documented CLI (`npx skills`) and the skills.sh registry API.
- `impeccable` checked, not installed (report-only per the task).

### Constraints this research is bounded by
- P1–P7 and L1–L13 in `FOR-AGENTS.md` (owner-not-manager, the four-step program, Villa `V`, star-scaled XP, server-side program state, one advisor, culture-as-data).
- **R14 / GAME-PHILOSOPHY rule 4:** engagement via goals, feedback, mastery and meaningful choices. **No energy, no paywalls, no loss-aversion streak punishment, no fake scarcity.** Every timer on the one `GAME_TIME_SCALE`.
- R13: difficulty is measured by the balance simulator, not asserted.

### Assumptions (stated because they affect the advice)
- **A1.** "Farm City" is used as genre shorthand in `INSTRUCTIONS.md`; the specific title's advisor is not documented in English-language sources I could find. I therefore cite the advisor pattern from Hay Day (Greg), Gardenscapes (Austin), Township (Professor Verne) and Clash of Clans, and cite Farm City only as a same-genre example. The pattern is what matters, not the one title.
- **A2.** The advisee is a first-time owner; the program must also not patronise experienced players. Recommendations therefore include skip/quiet rules (see §3.1).
- **A3.** All money examples are in **Villa (`V`)** per L13, using the `V1,500,000` / `V1.5M` style the spec will pick.

---

## 1. Patterns worth copying (and why)

### 1.1 The helper/advisor character

| Evidence | What it shows | Why it works |
|---|---|---|
| Hay Day's **Greg** is "every player's first friend … right at Farm Level 1, and … a regular visitor throughout the game" ([Supercell support](https://support.supercell.com/hay-day/en/articles/greg.html), [Hay Day Wiki](https://hayday.fandom.com/wiki/Greg)). | One persistent character, not a tooltip, anchors the early game and stays for the long tail. | A name and a face turn instructions into a relationship; players return to *the character*, which is cheaper than a new system. |
| Gardenscapes' **Austin the butler** narrates the restoration and the whole game is framed through him ([Playrix](https://playrix.com/games/gardenscapes), [Playrix Wiki](https://playrix.fandom.com/wiki/Austin)). | Advice is delivered diegetically (the character has a reason to speak). | GameRefinery calls this a **"justified tutorial"**: guidance tied to character/narrative directs attention and has meaning, instead of feeling like a chore ([GameRefinery](https://www.gamerefinery.com/first-impression-seals-the-deal-onboarding-best-practices-part-1/); [S. Alonso, onboarding lessons from game design](https://medium.com/@madebysan/hands-on-onboarding-lessons-from-game-design-941ab4ce8e98)). |
| Township's characters (e.g. Professor Verne) front its events and guide the first session ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2020/10/13/how-playrix-township-became-a-billion-dollar-game); [Township Wiki](https://township.fandom.com/wiki/Township) — "Players are guided through a brief tutorial at the very beginning"). | A short guided opening, then characters recur at milestones. | Front-loads teaching, then lets the world carry the theme between milestones. |
| Clash of Clans' tutorial has the player *do* the actions with prompts and only then explains ([Flammy's Total Newbie Guide](https://clashofclans.fandom.com/wiki/Flammy%27s_Strategy_Guides/Total_Newbie_Guide); [CXL on Clash Royale](https://cxl.com/blog/6-user-onboarding-flows/) — "a new user wins and experiences that feeling of achievement"). | Teach-by-doing, safe first win. | Act → see a result → infer the rule. "Taught feels passive; smart feels active" ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/onboarding-design-gamification-first-five-minutes/)). |
| FarmVille 2's loop is action → XP → level unlock ([Zynga](https://www.zynga.com/games/farmville-2/); [IGN guide](https://www.ign.com/wikis/farmville-2)). | Constant micro-progress. | A visible bar that moves keeps early sessions alive. |

**Copyable pattern:** one named, warm, culture-specific character whose lines are *justified* by the story, who teaches by asking the player to act, and who reappears at milestones instead of talking continuously.

### 1.2 Guided starts and step framing

- **One decision at a time.** Stacking choices in the first 30 seconds splits attention before the player has context ([Punchev, First 60 Seconds](https://punchev.com/blog/game-onboarding-ux-best-practices)).
- **Make the next step obvious.** "At every point in onboarding, the path forward should require almost zero thought" — simplifying choices is respect, not condescension ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/onboarding-design-gamification-first-five-minutes/)).
- **Teach by doing, make the default the good path, give feedback on everything** — every tap needs a reaction or it reads as "it did not work" ([Punchev](https://punchev.com/blog/game-onboarding-ux-best-practices)).
- **Compress to the first two layers, then reveal.** Progressive disclosure: introduce only what the first win needs; let the rest exist but stay quiet ("pull" help) rather than firing a cascade of modals ("push") ([NN/G, Onboarding Tutorials vs Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/); [Appcues](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns) — "showing everything at once" is the top mistake).
- **Sequence, don't pile.** The FTUE should hand the player one goal, let them act, and celebrate before the next goal appears.

**Copyable pattern:** a four-beat program (sign manager → sign players → build → reach Level 1) where each beat is a *small game*: a goal, the information held, the action, and a visible result.

### 1.3 Reward pacing and feedback

- **First Major Win fast.** The "wow" is the moment the player thinks "this works for me", not tutorial completion; get there in under ~2 minutes where possible ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/onboarding-design-gamification-first-five-minutes/); [Appcues](https://www.appcues.com/blog/user-onboarding-best-practices) — "value-first quick wins").
- **Endowed progress, near-completion, variable pacing, celebratory completion.** Start bars above 0 ("you're already on your way"), make the last 10% feel supported, celebrate milestones ([gamification-loops `references/patterns.md`](file:///home/emmanuel/.agents/skills/gamification-loops/references/patterns.md)).
- **Match reward size to effort**: low effort → small/frequent; high effort → large/rare ([same skill](file:///home/emmanuel/.agents/skills/gamification-loops/references/patterns.md)).
- **Immediate, clear feedback.** Loop quality needs fast feedback and clear causation ([game-design-theory SKILL.md](file:///home/emmanuel/.agents/skills/game-design-theory/SKILL.md)).
- **Feedback loops shape behaviour.** Positive loops reward winners and can snowball; Game Maker's Toolkit shows how designers balance them ([How Games Use Feedback Loops](https://www.youtube.com/watch?v=H4kbJObhcHw)). For fs-pro the balance simulator is where this is verified.
- **Keep rewards informational, not controlling.** Overjustification: extrinsic rewards can *replace* intrinsic motivation ("I do this for the points") ([gamification-loops `sharp_edges.md`](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)).

**Copyable pattern:** a moving progress bar from the first minute; a star ring-out after every step that explains *why* (informational); small frequent wins early, rarer meaningful rewards later; a big, scripted Level-1/league moment.

### 1.4 Difficulty curve, flow channel, meaningful choice

- **Flow channel.** Challenge must track skill; above the diagonal is anxiety, below is boredom, and "static difficulty produces flow briefly, then boredom" ([GameDesign.gg](https://gamedesign.gg/articles/flow-theory/); [Yu-kai Chou flow theory](https://yukaichou.com/gamification-analysis/flow-theory-complete-guide-csikszentmihalyi-optimal-experience/); [Gamasutra/Game Developer, The flow applied to game design](https://www.gamedeveloper.com/design/the-flow-applied-to-game-design)).
- **Flow is easier to kill than to create**: interruptions, unclear goals, unfair spikes and information overload break it — protect flow before optimising it ([GameDesign.gg](https://gamedesign.gg/articles/flow-theory/)).
- **Meaningful choice = consequences + ability + desirability.** Agency is not interactivity; it is decisions that matter, with visible outcomes ([University XP](https://www.universityxp.com/blog/2020/8/20/what-is-player-agency); [Game Design Skills](https://gamedesignskills.com/game-design/player-agency/)).
- **Difficulty is a feature here, not a wall.** "Not easy to beat, strategic" maps to *economic tension*: a V1M–V5M balance cannot buy everything, so allocation is the skill. R13 measures it in the simulator.

**Copyable pattern:** the difficulty comes from constrained resources and hidden information (scouting/interviews revealed at a cost), not from artificial timers; a first-time owner can always act, and a careless one is slower or must recover — never soft-locked.

### 1.5 The owner/chairman loop vs the manager loop

This is the phase-2 core shift (P1). The evidence is consistent:

| Source | Owner loop characteristic |
|---|---|
| Football Chairman's own guide: **"remember you're the Chairman, not the Manager"** — "keeping your bank account full is actually more important" than results; think in five-year plans; don't overstretch into facilities ahead of your division; **appoint the best manager you can** ([Football Chairman blog](https://football-chairman.net/blog/posts/five-tips-for-success-in-football-chairman)). | The owner optimises *solvency and structure*; the manager optimises *matches*. The owner influences; they don't pick the XI. |
| The **Recommended Max Wage** explainer frames the owner decision as income − costs = affordable wage bill ([Football Chairman blog](https://football-chairman.net/blog/posts/how-is-the-recommended-max-wage-figure-calculated)). | The owner's dashboard is a budget, not a tactics board. |
| Football Chairman store copy: "influence a team without directly controlling them" ([Google Play](https://play.google.com/store/apps/details?id=com.undergroundcreative.footballchairmanfree)). | Deliberate indirection is the fantasy. |
| OSM's board is "a group of people … in charge of you … obey what they say" ([OSM Wiki, The Board](https://online-soccer-manager.fandom.com/wiki/The_Board)); the store copy says "Your club's board is counting on you to deliver results" ([Google Play](https://play.google.com/store/apps/details?id=com.gamebasics.osm)). | A board/chairman layer adds goals and pressure *above* the manager. |
| Top Eleven's loop is manager-centric (tactics, transfers, training, stadium, finances) ([Top Eleven help](https://www.topeleven.com/old-site/help/)). | Contrast: when the player *is* the manager, the owner layer is absent. |
| FM's **Board/Supporter Confidence** combines weighted expectations across fans, dressing room, finance, media and coaching; expectations scale with club prestige ([FM Scout](https://www.fmscout.com/confidence.htm); [World League Manager](https://worldleaguemanager.com/blog/understanding-board-confidence); [FM27 Supporter Confidence](https://www.footballmanager.com/features/supporter-confidence)). | Multi-axis confidence gives the owner feedback that is broader than results. |

**Cautionary note:** FM's board confidence draws repeated complaints about opaque or un-catchable swings ([SI forums](https://community.sports-interactive.com/forums/topic/394530-board-confidence-feature-is-a-joke/)). Football Chairman's hardest cost is financial ([Football Chairman: Pro, Medium](https://medium.com/@mattkeeling92/football-chairman-pro-a-total-farce-76f24b22fb9f)). **Lesson:** any owner "board" or expectations mechanic in fs-pro must be transparent and recoverable, or it repeats the R14-era failure the owner is trying to avoid.

**Copyable pattern for fs-pro:** the owner's dashboard = cash, wage affordability, facilities, squad readiness and a manager whose quality changes *how well the brief is carried out*. The owner never picks the XI; match prep becomes the brief to the manager (L4).

### 1.6 Procedural naming for invented cultures

- **Syllable/template assembly** is the workhorse: "concatenate a random syllable from the start list, 0–4 from the middle-list and one from the end-list" ([GameDev StackExchange](https://gamedev.stackexchange.com/questions/129046/how-to-automatically-generate-creative-names-for-stuff)).
- **Markov chains** generate plausible names from a seed corpus ([Sam Twidale, Markov namegen](https://www.samcodes.co.uk/project/markov-namegen/); [RogueBasin, Markov chains-based name generation](https://www.roguebasin.com/index.php/Markov_chains-based_name_generation)). Good for *texture*, but needs guardrails.
- **Phonotactics** — the rules for which sounds may sit where. Define a syllable shape (e.g. Toki Pona's `V` or `CV(n)`; Konya's `C(S)V(N)`), plus allowed/forbidden clusters, before generating ([Wikibooks: Conlang/Phonotactics](https://en.wikibooks.org/wiki/Conlang/Intermediate/Sounds/Phonotactics); [S. Escher, Phonology Part 5: Phonotactics](https://stephenescher.blog/2020/03/31/an-in-depth-guide-to-creating-a-phonology-part-5-phonotactics/); [conlang.stackexchange](https://conlang.stackexchange.com/questions/1608/how-does-one-go-about-designing-phonotactics-for-a-conlang)).
- **Perceived uniqueness beats raw volume.** Kate Compton's "procedural oatmeal": thousands of outputs can still feel identical without deliberate variation ([Wikipedia, Procedural generation](https://en.wikipedia.org/wiki/Procedural_generation)). Variety must be *structured* (per-culture shape, length, rhythm), or it reads as noise.
- **Grammars** are a clean way to compose structured names (component rules and replacements) and are easier to author and constrain than pure statistical models ([ShaggyDev, generative grammars](https://shaggydev.com/2022/03/16/generative-grammars/)).
- **Collision control** is an engineering concern: deterministic seed + rejection sampling against a per-category set, measured over 100k. (No single canonical URL; this is standard practice implied by the above — see §3.5 for the concrete plan.)

**Copyable pattern:** per-culture phonotactics (inventory + syllable template + cluster rules + length distribution) driving template assembly; optional low-order Markov blended with the template for texture, always filtered through the phonotactics; deterministic seeded RNG; collision measurement; deny-list.

---

## 2. Anti-patterns to avoid (R14)

R14 forbids these outright; the research confirms *why* they are not just unethical but fragile.

| Anti-pattern | Why it is bad | What to do instead (for fs-pro) |
|---|---|---|
| **Energy / stamina gating play** | Repetition gated by energy then sold back is a canonical dark pattern ("repetition" + pay-to-skip) ([Better Internet for Kids](https://better-internet-for-kids.europa.eu/en/dark-patterns); [Yu-kai Chou on Brignull](https://yukaichou.com/gamification-analysis/dark-patterns-brignull-manipulative-design-ux/)). | No energy. Scarcity is *money* (V1M–V5M), which the player can always earn or recover (L7). |
| **Paywalls / pay-to-skip timers** | Monetising impatience by "melting currency through small transactions" ([Deconstructor of Fun, Township](https://www.deconstructoroffun.com/blog/2020/10/13/how-playrix-township-became-a-billion-dollar-game); [arXiv, Level Up or Game Over](https://arxiv.org/html/2412.05039v1) lists Pay Wall / Waste Aversion). | There is no store. Timers exist to make the world feel alive, on one `GAME_TIME_SCALE` (GAME-PHILOSOPHY rule 4). |
| **Loss-aversion streak punishment** | Streaks exploit loss aversion (~2:1) and sunk cost; harsh breaks create anxiety and guilt ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/dark-patterns-brignull-manipulative-design-ux/); [gamification-loops sharp_edges](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)). | If any cadence exists, allow freezes/grace and never remove earned progress. Prefer goals over streaks (L8 chapters, not login chains). |
| **Fake scarcity / FOMO offers** | Bait-and-switch and fake scarcity are called out as dark patterns beyond the UI ([Policy Review](https://policyreview.info/articles/news/unmasking-dark-patterns-video-games/1739)). | Real, explained constraints only (e.g. "only 3 managers this good are unsigned today" must be *true* and derived from the seeded market). |
| **Loot boxes / gacha aimed at the wallet** | The dark-pattern transition is when the system extracts beyond a knowing trade ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/dark-patterns-brignull-manipulative-design-ux/)). | The world seed is random in *attributes*, but the player sees and chooses; no paid randomness. Rare free agents are worth saving for (L5), which is a goal, not a slot machine. |
| **Infinite grind with no completion state** | "Never-ending grind" is a flagged failure; users need milestones ([gamification-loops validations](file:///home/emmanuel/.agents/skills/gamification-loops/references/validations.md)). | L8 chapters + Level-1 league moment + first Tier-2 facility give finite, meaningful completions. |
| **Demotivating global leaderboards** | Top 10% motivated, bottom 90% demotivated ([gamification-loops sharp_edges](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)). | Cohorts/tiers and personal bests; fs-pro already competes vs nearest-power clubs, not a global rank. |
| **Notification spam / FOMO messaging** | Multiple daily notifications and FOMO copy annoy and disrespect attention ([gamification-loops validations](file:///home/emmanuel/.agents/skills/gamification-loops/references/validations.md)). | Advisor tips have priority, cooldown and max-shows, with server-side dismissal (L9). Quiet is a feature. |
| **Overjustification** | Rewarding an already-enjoyable activity can permanently kill intrinsic motivation ([gamification-loops sharp_edges](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)). | Stars explain performance (informational); the fun of building the club stands on its own. |
| **Timers not on the game scale** | GAME-PHILOSOPHY rule 4: timers serve fun, not retention metrics. | One `GAME_TIME_SCALE`; no "come back in 12h to keep progressing". |

**Red-line checklist** (from the installed skill, directly usable as a test): for each mechanic ask — *Can the user stop without penalty? Do they feel good after? Does it respect their time? Would I want my family using this? Are we transparent?* ([gamification-loops sharp_edges](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)).

---

## 3. Concrete recommendations for fs-pro

These are inputs to the Batch-1 specs. Each is intentionally testable.

### 3.1 Advisor cadence (input to `ADVISOR-SPEC.md`, Agent 1B)

**Voice and form (fits L9/L10):** one named character from a starting culture; 4–6 expressions (neutral, happy, excited, worried, thinking); docks bottom-left with idle bob + blink; slides in with typewriter text; tap/Enter advances; can point at a world-space campus building; never covers PLAY, the dock or the resource HUD; respects `prefers-reduced-motion`; works at 390×844.

**Cadence rules (recommended defaults; the spec may tune with a reason):**
- **One line, one idea.** Advisor lines ≤ ~160 characters, max 2 lines desktop / 3 mobile. Text-fit is a Batch-4 gate anyway (FOR-AGENTS §4/Batch 4B).
- **Priority queue, single visible bubble:** `blocked/urgent` > `program step` > `contextual tip` > `flavour`. Only one bubble at a time; new higher-priority lines interrupt, lower ones queue and drop if stale.
- **Cooldowns and caps.** Each tip has a trigger, a priority, a cooldown and a `maxShows`; the server records dismissal (L9). Recommended starting values: max 1 unsolicited tip per ~60–90s, max 3 shows per tip, then dismissed forever unless a hard trigger re-arms it.
- **Step cadence.** On entering a program step: one framing line on arrival (the "why"), then no nagging. On step completion: one celebration line + expression swap (happy → excited on 3 stars).
- **Never interrupt.** Suppress tips during modals, negotiations, match playback and typing; queue them for the next idle moment.
- **Quiet after ignore.** After 3 ignored/unread tips, the advisor sleeps until a new step or a genuinely positive event. This is the anti-notification-spam rule.
- **Respect veterans.** A "quiet/skip tips" affordance and step replay; experienced players can complete steps without the advisor appearing.
- **Time/attention transparency.** Optional "take a break?" idle line after a long continuous session (healthy-engagement pattern, [gamification-loops sharp_edges](file:///home/emmanuel/.agents/skills/gamification-loops/references/sharp_edges.md)).
- **Deterministic text.** Advice is rule-based and deterministic from program state (no LLM in the loop); same state + same triggers ⇒ same line (L9, and it keeps replays/tests stable).

**UI rules to bake in early** (from the `game-ui-design` skill validations, all testable): minimum 44×44pt / 48×48dp touch targets, min 14px secondary text, `:focus-visible` rings, reduced-motion, z-index scale, animation duration ≤ 300ms for UI transitions, no color-only meaning ([game-ui-design validations](file:///home/emmanuel/.agents/skills/game-ui-design/references/validations.md)).

### 3.2 Step framing (input to `OWNER-PROGRAM-SPEC.md`, Agent 1A)

Frame each of P2's four steps as its own small game:

1. **Sign a manager** (from the seeded V1M–V5M budget).
2. **Sign players** (free-agent + transfer markets; minimum legal matchday squad = gate on PLAY).
3. **Build facilities** (Tier wording).
4. **Reach Level 1** → the game assigns a league (the big reveal).

For **each step**, the spec should state:
- **The decision:** what the player is choosing (and, per meaningful-choice theory, what it costs them elsewhere).
- **What is known vs hidden:** e.g. manager/player true attributes hidden until scouting/interview at a cost — this is where "strategic, not easy" lives ([meaningful choice](https://www.universityxp.com/blog/2020/8/20/what-is-player-agency)).
- **The trade-offs:** three sample allocations at V1M / V3M / V5M that each hurt somewhere (spec requirement).
- **Star scoring (1–3 = decision quality, not completion):** define the predicate per step; stars drive the XP award (L6).
- **Failure and recovery:** no dead ends; the recovery route (board advance at a cost, or selling a player) is stated and simulated (L7).
- **Advisor lines** that frame it (see 3.1), written as justified narration, not tooltips.

**FTUE rules:** one decision at a time; a smart default; teach by doing (the player performs the action once in a safe context); the next step is obvious; results are immediate ([Punchev](https://punchev.com/blog/game-onboarding-ux-best-practices); [Appcues](https://www.appcues.com/blog/user-onboarding-best-practices)).

**The starting-balance reveal is the first "wow".** Show the drawn V-value as part of the first step's story (L1), with the advisor explaining what it can and cannot buy — an early, concrete win that also sets the tension.

### 3.3 Reward pacing (inputs to 1A + 2A)

- **Endowed progress.** Start the Level 0→1 XP bar visibly above 0 (e.g. the first program step's XP is already on the bar). "You're already on your way."
- **Bounded step XP, earned the rest.** Program steps award a bounded share of the 100 XP scaled by 1–3 stars; the remainder must come from winning qualifying friendlies (L6). This keeps a careless build from coasting.
- **Small-frequent → large-rare.** Manager/player/facility steps give smaller, quicker star payoffs; Level 1 + league draw is the scripted large payoff.
- **Informational stars.** The star reveal must say *why* (e.g. "3★ — you got a strong manager and kept V600k in reserve"), protecting intrinsic motivation.
- **Celebration but a hard stop.** One sting + expression swap, then the advisor goes quiet. No endless chatter.
- **Milestone moments** at: balance reveal, manager signed, legal squad reached, facility built, Level 1 reached + league assigned; then L8 chapters (first-season target, first Tier-2 facility) feed the existing challenge card.
- **Simulator hooks.** Reward tables live in Go `internal/program` and are exercised by the balance simulator (R13): star↔time-to-league correlation is a Batch-4 target.

### 3.4 Difficulty curve (inputs to 1A + 2A/4A)

- **Skill, not luck, wins.** Design target (L7): a balanced-expert owner starting at V1M reaches Level 1 faster (median) than a naive owner starting at V5M. Every knob the simulator exposes must serve this.
- **Economic tension is the difficulty.** With V1M–V5M, the player cannot buy the ideal manager *and* the ideal squad *and* facilities. The three sample allocations must show where each hurts.
- **Teach the flow channel.** Step 1 should be the safest (a manager who fits any budget); each later step raises the information/opportunity cost; qualifying friendlies are the real skill gate.
- **No flow killers.** No unfair spikes, no opacity; every failure state has a visible cause and a route back (protect flow: [GameDesign.gg](https://gamedesign.gg/articles/flow-theory/)).
- **Measured, not asserted (R13).** Batch 2A builds the simulator; Batch 4A tunes only spec knobs to targets: expert inside target at every balance; every naive strategy ≥2× slower or needing recovery; 0 soft-locks; star ratings correlate with time-to-league. Also run the 1,000-runs-per-strategy sweep and three scripted Playwright playthroughs.
- **Transparent owner feedback (not FM-style opaque confidence).** If a board/expecations layer ships, it must be explainable and recoverable (the FM complaint above); prefer "wage affordability vs cash" (Football Chairman's model) as the owner's honest feedback.

### 3.5 Naming generator (input to `CULTURES-SPEC.md`, Agent 1C)

**Model each culture as data (L12):**
```
Culture {
  id, displayName
  phonology: { consonants[], vowels[], syllableTemplates[] e.g. ["CV","CVC","CVn","CCV"],
               allowedOnsets[], allowedCodas[], forbiddenClusters[],
               lengthDistribution }
  banks: { firstNames[], surnames[], clubPatterns[], regionNames[], cityNames[],
           districtNames[], stadiumPatterns[] }
  arrangements: { patternPools per kind }
}
```
Seed each bank from `docs/cultures/*` (Bellean's "Dha Marm", Ivania, Tileland; Ashter's "-Kin" cities; Palaba's 15 provinces; Kev's 12 states; Kiyoto; Simeon; Hunterland), the existing `Places`, and the existing player names — plus the Node syllable tables being retired (`services/transfers/system-country-names.service.ts`).

**Generation algorithm (recommended):**
1. **Template/syllable assembly is primary** — concatenate onset/nucleus/coda per the culture's syllable templates ([GameDev SE](https://gamedev.stackexchange.com/questions/129046/how-to-automatically-generate-creative-names-for-stuff); [Wikibooks phonotactics](https://en.wikibooks.org/wiki/Conlang/Intermediate/Sounds/Phonotactics)).
2. **Optional low-order Markov for texture**, trained per culture on its seed names, always filtered through the culture's phonotactics (reject unpronounceable output). Markov alone risks "procedural oatmeal" ([Wikipedia](https://en.wikipedia.org/wiki/Procedural_generation); [Sam Twidale](https://www.samcodes.co.uk/project/markov-namegen/)).
3. **Structured variety** — vary length, rhythm and morphology per name kind (a stadium should not read like a person's surname). Grammars are a clean way to encode this ([ShaggyDev](https://shaggydev.com/2022/03/16/generative-grammars/)).

**Mix-aware countries.** A country's demographic mix selects a culture bank by weight (e.g. Bellean 50% Karsh-Barbar / 30% Proman-Karsh / 20% Nabumian; Ekhastan 60/20/5/15). Compare a histogram of 100k generated names against the mix weights in the spec test.

**Collision control:**
- Deterministic seeded RNG per generation request; store `cultureId + seed` so any name is reproducible/auditable.
- Uniqueness within a category via rejection sampling against a set; cap retries, then disambiguate (natural suffix, then a short numeric suffix only as last resort).
- Measure the collision rate over **100k** names per culture and per kind (L12); the floors are **≥400 distinct first names and ≥400 surnames per starting culture**.
- Cross-category guards so a new club name can't equal an existing real club.

**Deny-list:**
- Real people (notable names), real clubs, and slurs/profanity.
- Normalise before matching (casefold, strip diacritics/punctuation, collapse whitespace) and match substrings as well as whole tokens.
- Separate lists per kind; a deny-list test asserts generated samples never hit one (L12).
- Extensibility: adding a culture/country is adding data, never code; unused sheet place names are offered first when a founder opens a region/city.

**Worldgen boundary:** all of this lives in Go `services/worldgen` per R3′; Node calls it and keeps no naming tables (fallback logged only when worldgen is down).

---

## 4. Skills: found, installed, exact commands

### 4.1 Already present (not installed by me)
- `find-skills` at `~/.claude/skills/find-skills` → `/mnt/c/Users/Emmanuel/.agents/skills/find-skills`. Used to guide the search (leaderboard first, verify installs/source/security).
- The nine `threejs-*` skills at `~/.claude/skills/` (`threejs-game-director`, `-game-ui-designer`, `-gameplay-systems`, `-qa-release`, `-image-generator`, `-3d-generator`, `-aaa-graphics-builder`, `-audio-generator`, `-debug-profiler`). Verified to be the pack `majidmanzarpour/threejs-game-skills` (9 skills, ~23.5K total installs) — [skills.sh pack](https://skills.sh/majidmanzarpour/threejs-game-skills). **No action needed.**

### 4.2 What `find-skills` found
- CLI `npx skills find <query>` returned no well-known game-design/gamification/onboarding skills (mostly unrelated "design"/"game audio" hits). The skills.sh registry API (`https://skills.sh/api/search?q=...`) surfaced the real candidates, including `pluginagentmarketplace/custom-plugin-game-developer/game-design-theory`, `omer-metin/skills-for-antigravity/{game-ui-design,gamification-loops,game-design-core,progression-systems}`, and `majidmanzarpour/threejs-game-skills/*`.
- Per find-skills guidance (prefer ≥1K installs, prefer official/known sources, be sceptical under 100), I excluded low-install / low-star / unverifiable options.

### 4.3 Installed (exact commands, evidence)
All three had a documented install command on their skills.sh page, passed all three security audits (`Gen Safe`, `Socket 0 alerts`, `Snyk Low Risk`), and installed successfully (the "PromptScript" line is a non-fatal secondary target; the agent-skill copy succeeded).

```bash
npx -y skills add https://github.com/pluginagentmarketplace/custom-plugin-game-developer --skill game-design-theory -g -y
# ✓ game-design-theory (copied) → ~/.agents/skills/game-design-theory
#   https://skills.sh/pluginagentmarketplace/custom-plugin-game-developer/game-design-theory  (2.3K installs, 36★, Gen Safe / Socket 0 / Snyk Low)

npx -y skills add https://github.com/omer-metin/skills-for-antigravity --skill gamification-loops -g -y
# ✓ gamification-loops (copied) → ~/.agents/skills/gamification-loops
#   https://skills.sh/omer-metin/skills-for-antigravity/gamification-loops  (515 installs, 162★, Gen Safe / Socket 0 / Snyk Low)

npx -y skills add https://github.com/omer-metin/skills-for-antigravity --skill game-ui-design -g -y
# ✓ game-ui-design (copied) → ~/.agents/skills/game-ui-design
#   https://skills.sh/omer-metin/skills-for-antigravity/game-ui-design  (3.5K installs, 162★, Gen Safe / Socket 0 / Snyk Low)
```

Resolved on this Linux host as `$HOME=/home/emmanuel`, so the payloads are at:
`/home/emmanuel/.agents/skills/game-design-theory`, `/home/emmanuel/.agents/skills/gamification-loops`, `/home/emmanuel/.agents/skills/game-ui-design`
(from Windows this is `C:\Users\Emmanuel\.agents\skills\...`). OpenCode picked all three up immediately (they appear in the available-skills list).

**Why these three:** `game-design-theory` (MDA, balance, progression, flow) and `gamification-loops` (explicitly *ethical* engagement, with the anti-dark-pattern red lines this report's §2 is built on) directly serve the advisor/program/simulator work; `game-ui-design` adds a testable UI validation set (touch targets, text size, reduced motion, focus) for the advisor and program screens. `find-skills` returned them via the registry; only commands with a README/registry install line were run.

### 4.4 Considered but not installed (and why)
- `omer-metin/skills-for-antigravity/game-design-core` (434 installs) and `progression-systems` (57) — relevant but under the 1K preference and largely covered by `game-design-theory`; skipped to avoid clutter.
- `omer-metin/.../game-monetization` (328) — intentionally skipped; fs-pro has no monetisation (R14).
- `playableintelligence/game-creator/*`, `stanestane/game-design-skills-bundle/*` (audit-only packs) — lower installs / unfamiliar sources; not needed.

---

## 5. `impeccable` status (report only — did NOT install)

**Is it installed? No.**
`C:\Users\Emmanuel\.impeccable` (`/mnt/c/Users/Emmanuel/.impeccable`) contains only `update-check.json` (51 bytes):
```json
{"lastCheck":1791083509837,"latestVersion":"4.5.0"}
```
No skill payload, no `bin/`. Confirms R8′'s note that impeccable is not installed. **The directory was left untouched.**

**Is install possible? Yes (not performed).**
- Node `v24.21.0` and `npx 11.19.0` are present; npm registry reachable: `npm view impeccable version dist-tags` → `version = '4.1.0'`, `dist-tags = { latest: '4.1.0' }`.
- The README's documented commands are `npx impeccable install` (interactive) or scripted with `--providers=claude,codex,cursor,grok,hermes,veto --scope=project|global` ([README](https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md)). It also supports OpenCode (`dist/opencode/.opencode`) and DeepSeek Harness (`dist/dsh/.dsh`). The repo is reachable (GitHub `200`).
- **Version note:** the local `update-check.json` recorded `latestVersion 4.5.0` on 2026-10-03, while the npm-published `impeccable` package's `latest` dist-tag is `4.1.0` today. These are likely the engine's internal version vs. the npm shim's package version; the installer resolves the pinned engine on first run. Worth a one-line check in `DECISIONS.md` if the lead proceeds.
- **Recommendation:** the lead owns this call. If `npx impeccable install` is run, use `--scope=global` (or `--providers=...` non-interactively) per the README; if it fails or blocks, R8′ already provides the fallback (`threejs-game-ui-designer` for the same review steps) and it should go in `DECISIONS.md`. I did not run it here.

---

## 6. References (all URLs cited above)

**Advisor / guided start**
- Supercell, *Greg* — https://support.supercell.com/hay-day/en/articles/greg.html
- Hay Day Wiki, *Greg* — https://hayday.fandom.com/wiki/Greg
- Playrix, *Gardenscapes* — https://playrix.com/games/gardenscapes
- Playrix Wiki, *Austin* — https://playrix.fandom.com/wiki/Austin
- Deconstructor of Fun, *How Playrix' Township Became a Billion Dollar Game* — https://www.deconstructoroffun.com/blog/2020/10/13/how-playrix-township-became-a-billion-dollar-game
- Township Wiki — https://township.fandom.com/wiki/Township
- Farm City, *Farming & Building* (Google Play) — https://play.google.com/store/apps/details?id=com.citybay.farming.citybuilding
- Clash of Clans Wiki, *Flammy's Total Newbie Guide* — https://clashofclans.fandom.com/wiki/Flammy%27s_Strategy_Guides/Total_Newbie_Guide
- Zynga, *FarmVille 2* — https://www.zynga.com/games/farmville-2/
- IGN, *FarmVille 2 Guide* — https://www.ign.com/wikis/farmville-2

**Onboarding / difficulty / feedback / agency**
- GameRefinery, *First Impression Seals the Deal (Onboarding Best Practices Pt 1)* — https://www.gamerefinery.com/first-impression-seals-the-deal-onboarding-best-practices-part-1/
- Santiago Alonso, *Hands-on onboarding lessons from game design* — https://medium.com/@madebysan/hands-on-onboarding-lessons-from-game-design-941ab4ce8e98
- Yu-kai Chou, *Onboarding Design: Win Users in the First 5 Minutes* — https://yukaichou.com/gamification-analysis/onboarding-design-gamification-first-five-minutes/
- Yu-kai Chou, *Flow Theory: Csikszentmihalyi's 9 Components* — https://yukaichou.com/gamification-analysis/flow-theory-complete-guide-csikszentmihalyi-optimal-experience/
- GameDesign.gg, *Flow Theory in Game Design: The Complete Guide* — https://gamedesign.gg/articles/flow-theory/
- Game Developer, *The flow applied to game design* — https://www.gamedeveloper.com/design/the-flow-applied-to-game-design
- Punchev, *Game Onboarding UX: Best Practices for a First 60 Seconds* — https://punchev.com/blog/game-onboarding-ux-best-practices
- NN/G, *Onboarding Tutorials vs. Contextual Help* — https://www.nngroup.com/articles/onboarding-tutorials/
- Appcues, *User Onboarding Best Practices* — https://www.appcues.com/blog/user-onboarding-best-practices
- Appcues, *Onboarding UX: 10 patterns* — https://www.appcues.com/blog/user-onboarding-ui-ux-patterns
- CXL, *6 user onboarding flows* — https://cxl.com/blog/6-user-onboarding-flows/
- University XP, *What is Player Agency?* — https://www.universityxp.com/blog/2020/8/20/what-is-player-agency
- Game Design Skills, *Designing Player Agency* — https://gamedesignskills.com/game-design/player-agency/
- Game Maker's Toolkit, *How Games Use Feedback Loops* — https://www.youtube.com/watch?v=H4kbJObhcHw

**Owner / chairman football games**
- Football Chairman blog, *Five Tips for Success* — https://football-chairman.net/blog/posts/five-tips-for-success-in-football-chairman
- Football Chairman blog, *Recommended Max Wage* — https://football-chairman.net/blog/posts/how-is-the-recommended-max-wage-figure-calculated
- Football Chairman (Google Play) — https://play.google.com/store/apps/details?id=com.undergroundcreative.footballchairmanfree
- OSM Wiki, *The Board* — https://online-soccer-manager.fandom.com/wiki/The_Board
- OSM (Google Play) — https://play.google.com/store/apps/details?id=com.gamebasics.osm
- Top Eleven Help Center — https://www.topeleven.com/old-site/help/
- FM Scout, *Confidence* — https://www.fmscout.com/confidence.htm
- SI Forums, *Board Confidence feature is a joke* — https://community.sports-interactive.com/forums/topic/394530-board-confidence-feature-is-a-joke/
- World League Manager, *Understanding Board Confidence* — https://worldleaguemanager.com/blog/understanding-board-confidence
- Football Manager, *Supporter Confidence* — https://www.footballmanager.com/features/supporter-confidence
- Matthew Keeling, *Football Chairman: Pro – a Total Farce* — https://medium.com/@mattkeeling92/football-chairman-pro-a-total-farce-76f24b22fb9f

**Anti-patterns / dark patterns (R14)**
- Yu-kai Chou, *Dark Patterns: Brignull's 12 Manipulative UX Tricks* — https://yukaichou.com/gamification-analysis/dark-patterns-brignull-manipulative-design-ux/
- Better Internet for Kids (EU), *Dark patterns* — https://better-internet-for-kids.europa.eu/en/dark-patterns
- Policy Review, *Gaming the mind: Unmasking 'dark patterns' in video games* — https://policyreview.info/articles/news/unmasking-dark-patterns-video-games/1739
- arXiv, *Level Up or Game Over: Exploring How Dark Patterns Shape Mobile Games* — https://arxiv.org/html/2412.05039v1

**Procedural naming / conlang phonotactics**
- GameDev StackExchange, *How to automatically generate (creative) names for stuff?* — https://gamedev.stackexchange.com/questions/129046/how-to-automatically-generate-creative-names-for-stuff
- Sam Twidale, *Procedural Name Generator (Markov)* — https://www.samcodes.co.uk/project/markov-namegen/
- RogueBasin, *Markov chains-based name generation* — https://www.roguebasin.com/index.php/Markov_chains-based_name_generation
- Wikibooks, *Conlang/Intermediate/Sounds/Phonotactics* — https://en.wikibooks.org/wiki/Conlang/Intermediate/Sounds/Phonotactics
- Stephen Escher, *An In-Depth Guide to Creating a Phonology – Part 5: Phonotactics* — https://stephenescher.blog/2020/03/31/an-in-depth-guide-to-creating-a-phonology-part-5-phonotactics/
- Conlang StackExchange, *How does one go about designing phonotactics?* — https://conlang.stackexchange.com/questions/1608/how-does-one-go-about-designing-phonotactics-for-a-conlang
- Wikipedia, *Procedural generation* — https://en.wikipedia.org/wiki/Procedural_generation
- ShaggyDev, *Generative grammars as a form of procedural content generation* — https://shaggydev.com/2022/03/16/generative-grammars/

**Skills tooling**
- find-skills SKILL.md (local) — `/mnt/c/Users/Emmanuel/.agents/skills/find-skills/SKILL.md`
- skills.sh — https://skills.sh/ · registry API `https://skills.sh/api/search?q=...`
- Installed skills (local): `game-design-theory/SKILL.md`, `gamification-loops/{SKILL.md,references/patterns.md,references/sharp_edges.md,references/validations.md}`, `game-ui-design/{SKILL.md,references/*}`
- threejs pack — https://skills.sh/majidmanzarpour/threejs-game-skills
- impeccable README — https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md · repo https://github.com/pbakaus/impeccable
