# FSPro — "Clash of Clans / SimCity for Football"

Direction source: [GAME-PHILOSOPHY.md](./GAME-PHILOSOPHY.md). Tracker: [PERSISTENT-STRATEGY-GAME-TRACKER.md](./PERSISTENT-STRATEGY-GAME-TRACKER.md).
Rewritten 2026-09-21 (replaces the earlier league-pods/season-cycle plan).

## Core idea
**The match is the primary interaction loop, not an activity inside a league season.**

> build club -> press PLAY -> get matchmade -> earn cash / XP / reputation -> upgrade club -> play stronger opponents

- You don't ask "which league am I in?" but "what level is my club and what can it do?".
- A new club starts from scratch: dirt turf, 11 players, Level 0 facilities, little cash.
- Matches have **stakes** (fatigue and injuries, challenges with deadlines, entry-fee tournaments) so nobody just grinds endlessly.
- The club is a **persistent world object**: it keeps existing (upgrades finishing, income, events) while the player is away, and "N things happened while you were away" is the return experience.
- No traditional leagues are needed going forward. The seeded league world (2 countries, divisions 1 and 2, the AI clubs) is kept **only as memories/history** and as the pool of AI opponent clubs.

## Mapping to Clash of Clans / SimCity
| Inspiration | FSPro |
|---|---|
| Village | Club campus: stadium grounds, stands, training ground, academy (later medical, scouting, coaching, media) |
| Attack | **A match** (PLAY -> matchmaking -> battle -> rewards) |
| Loot / trophies | Cash, Club XP -> Club Level, reputation, fans |
| Builders + upgrade timers | Limited concurrent upgrade projects, **real-time** timers |
| Clan wars / events | Rival matches, entry-fee tournaments, event clubs (later) |
| City simulation | Stadium income, wage bill, fan growth, injuries |
| Persistent world | Club state advances offline; return summary |

## Systems
### 1. Club campus (levelled assets) — built
Levels 0-5, cash cost, **real-time build time**, prerequisites, concurrency limit. Effects should change how you play, not just apply a stat bonus: Training Ground unlocks training programmes, Academy produces real players, Scouting finds better opponents/targets, Medical cuts injury downtime, Stadium raises match revenue and unlocks bigger events, **Coaching staff unlock tactical abilities** in the match engine (Level 0: pass/shoot/defend; Level 3: through ball, press, counter...; Level 8: overloads, offside trap...).

### 2. PLAY and matchmaking
Press PLAY -> the system finds an appropriate opponent by **power** (club rating today). Opponent pool, in order of build: AI clubs -> other humans' clubs played **asynchronously** from a saved snapshot -> event/rival/tournament opponents. Matches use QuickSim (the live engine can drive a "BATTLE" screen later). Stadium gate income is credited per match, and wins/draws/losses pay cash + XP.

### 3. Stakes and objectives
- **Club challenges**: "Win N matches within T hours" for cash + XP (MVP: one challenge type, auto-issued).
- Entry-fee tournaments (8 clubs, winner takes the pot), rival battles, milestones (Club XP thresholds unlock facilities).
- Anti-grind: squad fatigue/injuries, match cooldown, entry fees. Economy must be tuned so matches don't print money.

### 4. Progression
Club XP -> Club Level (gates facility max levels later). Reputation and fans grow with results and stadium level.

### 5. Persistence
Timers are real time (upgrade completion, challenge deadlines). Completion is lazy-resolved on read plus a periodic sweep, so it works with nobody online. Away-summary feed is a later item.

## Reuse from the existing codebase
Match engine + QuickSim + penalties, live streaming, prize-money/ledger patterns (`TransferLedger`), transfer market + scouting, training/fitness/lifecycle services, world feed and media, auth + club ownership, the facilities system built 2026-09-21.

## Deferred / superseded (kept in code, not extended)
- League pyramid, pods, tiers, generalised promotion (migration 0024, `pyramid.service.ts`) — designed for scheduled seasons; harmless, backward compatible, no longer central.
- Automatic season cycle, off-season idle days on the calendar clock — the global fixtures calendar no longer drives gameplay.
- Bot-seat takeover / mid-season join rules — not needed with matchmaking.
- Calendar-day timers — replaced by real-time timers.

## Roadmap
1. **MVP loop (in progress)**: facilities with real-time timers, PLAY vs AI clubs with power-based matchmaking, match rewards (cash + XP + gate income), one challenge type, Club Level from XP, play + facilities UI.
2. Away summary ("while you were away"), notifications inbox, challenge variety, daily challenges.
3. Facility effects that change play: coaching staff -> tactical abilities, academy produces players, scouting -> opponent choice, medical -> injuries; more facilities (medical, scouting, coaching, media/PR).
4. Async human-vs-human: saved club snapshots, opponent pool, rivalries.
5. Tournaments (entry fee, 8 clubs, knockout via the existing engine), rival battles, event clubs.
6. Economy structure: proper club ledger (income/expense streams), sponsors, fans, reputation; anti-grind tuning.
7. New-club creation flow (start from scratch), onboarding first challenge.
8. BATTLE screen: live match presentation, tactical abilities in play.
9. Live-ops, cosmetics, mobile companion.

## Decisions (2026-09-21)
- Timers: real time. Calendar demoted to background for the seeded AI world.
- Match structure: on-demand matchmaking, not scheduled fixtures, lobbies or pods.
- Old leagues: memories only, not used for new players.
- New clubs start from scratch (Level 0, 11 players).
- Open: monetization stance; exact anti-grind levers (cooldown vs energy vs fatigue only); async human opponents timing; whether stakes include losing something on defeat.
