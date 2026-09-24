A world that reacts: closing the consequence loops (CoC × FM)
Context
The ask: "My team has been losing for a while, but I don't see any side-effects from fans, media, etc. I need more holistic integration of the world." Direction confirmed as a mix of Clash of Clans and FM, not a pivot back to leagues. FM-style tactics/deep control is explicitly deferred — "we have a template to go back to."

Three parallel research passes (server systems, client screens, match engine + roadmap docs) found the problem is not missing features. The reactive machinery largely exists but is wired to the old league world, while the game is now played through a season-less matchmaking loop. Four verified root causes:

The narrative engine is blind to your matches. services/media/story-angles.service.ts already has losing_streak, winning_streak, unbeaten_run, goal_drought, leaky_defence angles. But gatherFixtureFacts (services/media/story-facts.service.ts:78-99) only queries WHERE SeasonId = season.id and returns played: [] with no season. playMatch creates season-less Type:'friendly' fixtures titled "(Matchmade)". So form is always [], streak always null — losing_streak can never fire for the PLAY loop.
The quantities the world should react to are client-side fictions. Fans = 120 + level*150, Reputation = 3 + level*2 (club-game.vue:206,211), Fan Approval = a literal 82%, Season Expectations = 3 static bullets (owner-zone.vue). There are no Fans/Reputation columns in schema.ts. players.Morale is a decorative free-text string set only by a transfer-listing reaction; nothing reads it.
Attendance ignores everything. controllers/game/functions.ts:126: attendance = capacity * (0.65 + 0.3 * Math.random()). Pure noise — winning and losing produce identical crowds.
The match outcome model has no room for mood. computeExpectedGoals (QuickSimResolver.ts:170-188) is unit ratings + flat homeAdvantage = 0.25 + a styleBonus that merely substring-matches the style name. Formation, roles and fatigue are ignored entirely.
Intended outcome: results write to persistent world state; that state is read back by systems the player can feel (crowds, money, morale, media, board). A losing run should visibly cost you.

Design principle — no dead effects. The previous pass found 4 of 7 facilities computed effects nothing read. Same bug class. Every field added here must have a named consumer in the same phase.

Phase 1 — The reactive substrate (keystone)
Persist the quantities the world reacts to, and update them from one place both match paths pass through.

Migration (plain SQL + runner, matching scripts/migration/run-00NN-migration.ts; next free number after 0025): add to Clubs — Fans (int), Reputation (int), BoardConfidence (int 0-100), Form (jsonb: recent W/D/L + streak). Add players.MoraleValue (int 0-100) alongside the existing string, so current readers keep working.
Backfill one-off script in the same style as scripts/migration/backfill-club-assets.ts: seed Fans/Reputation from division + current Rating so existing clubs don't start at zero.
New services/world/club-standing.service.ts exporting applyMatchOutcome(clubId, { outcome, goalsFor, goalsAgainst, opponentReputation }). It updates Form, then moves Fans / Reputation / BoardConfidence / squad Morale by bounded deltas (clamp per match; upsets swing more than routine results). Single source of truth.
Call it from exactly one seam: updateFixture in controllers/game/functions.ts — both league matchdays and playMatch already flow through it (that is where gate income is credited today). Do not add a second call in play.service.ts.
Phase 2 — Consequences the player feels
Each consumer is small and surgical; together they make losing hurt.

Crowds empty out. Replace the random band at functions.ts:126 with fan-mood-driven turnout: attendance = capacity × f(Fans, Form, opponent draw). Because match rewards are already a % of gate net (previous pass), a losing run now compounds — smaller crowd → smaller gate → smaller reward.
Morale affects the pitch. Feed squad morale + form into computeExpectedGoals (QuickSimResolver.ts:170) as a small bounded modifier. That one function is deliberately shared with the performance analysis (per its own comment), so analytics stay consistent. Clamp hard (≤ ±10%) and add a floor — an unclamped morale→performance→morale loop is a death spiral.
Reputation gates the market. Feed club Reputation into aiResponse (services/transfers/transfer-market.service.ts:134) so weak-reputation clubs get refused by better players, and into getScoutedShortlist quality.
The board notices. services/ai/board-budget.service.ts already weighs league position and wage ratio — give it real BoardConfidence and Form instead. Budget requests get harder on a losing run.
Phase 3 — Make it visible (the actual complaint)
Invisible consequences are the same as none.

Unblind the media engine (highest value, smallest change). In gatherFixtureFacts (story-facts.service.ts:78), when season is null, fall back to the club's recent matchmade fixtures (Played = true, title LIKE '%(Matchmade)', per matchmadeBy in play.service.ts:106) to build form/streak/gf/ga. Position/points stay null. This alone makes losing_streak, goal_drought and leaky_defence fire on the PLAY loop through the existing MediaHubService.
Inbox. A real message feed (new table + contract route + client screen) consuming media items, board reactions, injuries and transfer offers, with read/unread. This replaces the canned manager-briefing-toast.vue and the client-invented away-summary-modal.vue (club-game.vue:319-394, built from localStorage last-seen, not server events).
Retire the mocks. Point Fans / Reputation / Fan Approval / Season Expectations / Squad Value at the real fields (club-game.vue, owner-zone.vue). Delete the generateLocalFallback() hardcoded-story path in general-media-card.vue:931 or make it visibly a degraded state.
Phase 4 — Deferred: FM tactics & deep control
Per your steer, the FM template is known and can wait. Recorded so it isn't lost: player roles/duties (15 roles with tendencies already exist in simulation/player/PlayerRole.ts, just not manager-assignable), team instructions beyond the 5 styles, set-piece takers (penalty taker is currently getRandomATTMID), real half-time subs/shouts (Game.changeTactic works mid-match but has no command channel into the worker; Milestone 21 "Not started"). Blocker to note: QuickSim ignores formation and roles, so tactical depth stays invisible until PLAY either leaves QuickSim or QuickSim learns to read tactics.

Critical gotchas
@repo/api-contract loads a gitignored dist — run npm run build there after any contract change or the server crashes at startup.
Migrations 0015+ are plain SQL applied by scripts/migration/run-00NN-migration.ts, not the drizzle journal.
Snapshot the dev DB before destructive checks and count-check after restoring (fspro-snapshot3.sql is the last verified-clean baseline: 2,089 fixtures / 0 matchmade / XP 0 / 0 challenges / 176 assets / 0 reward-or-facility ledger rows).
QuickSim uses Math.random (10 sites) and is non-deterministic — repeat-run verification needs sample sizes, not single-match asserts.
Death-spiral risk in Phase 2 is the main balance hazard; clamp and floor every mood modifier.
Verification
Follow the established dual-backend live-test method; snapshot first, restore and count-check after.

tsc clean (server + contract), client vite build clean.
The core scenario, end to end: force a test club to lose ~6 matchmade matches in a row via a throwaway script (as used last pass), then assert the chain: Form shows the streak → Fans and Reputation fall → BoardConfidence falls → attendance and gate net measurably drop vs the pre-streak baseline → squad MoraleValue falls → MediaHubService.getMediaFeed returns a losing_streak story for that club → the inbox contains it.
Mirror it with a winning run and confirm the deltas reverse and stay bounded (no runaway in either direction over ~20 matches).
Confirm a league matchday still updates the same fields through the same seam (no double-counting from two call sites).
Browser check at /game/:clubId: Fans/Reputation/Fan Approval show real values, and the inbox surfaces the losing-streak story.
Update docs/PERSISTENT-STRATEGY-GAME-TRACKER.md with before/after numbers for the losing-run scenario.
Critical files
apps/fs-pro-server/src/db/drizzle/schema.ts + new migration & backfill scripts
New apps/fs-pro-server/src/services/world/club-standing.service.ts (the single applyMatchOutcome seam)
apps/fs-pro-server/src/controllers/game/functions.ts (updateFixture — the one call site; attendance formula at ~:126)
apps/fs-pro-server/src/simulation/quick-sim/QuickSimResolver.ts (computeExpectedGoals)
apps/fs-pro-server/src/services/media/story-facts.service.ts (gatherFixtureFacts season-less fallback) — unlocks the existing story-angles.service.ts
apps/fs-pro-server/src/services/transfers/transfer-market.service.ts (aiResponse), services/ai/board-budget.service.ts
packages/api-contract/src/ (inbox + club world-state fields) — rebuild after
apps/fs-pro-client/src/views/game/club-game.vue, views/user/club/zones/owner-zone.vue, components/media/general-media-card.vue, plus a new inbox screen
