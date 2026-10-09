# Core loop (launch build)

The game already had every system a Clash of Clans–style loop needs: campus, builders, PLAY, matchmaking, the Matchzone, rewards, Level/XP, a world map and pyramid leagues. What it lacked was one flow that joins them up. This doc sets that flow. It sits under [GAME-PHILOSOPHY.md](./GAME-PHILOSOPHY.md) and doesn't change the competition model ([WORLD-PYRAMID-SPEC.md](./WORLD-PYRAMID-SPEC.md)).

## Player promise

Build a football club from a dirt pitch into a world power, one match at a time.

## Core loop contract

> The player **plays matches** (the attack) to earn **cash and XP**, while **rest cooldowns, a league table and the board** create pressure. Wins pay more, add fans and move them up the table. Defeats cost fans and board confidence, and the next match is one rest away.

| CoC | Spro |
| --- | --- |
| Village | Campus (`/game/:clubId`): the only home screen for a player |
| Gold mine / collector | **Club shop**: income builds up every hour from fans and seats. Tap the coin bubble over the Stands to collect it. Storage is capped, so coming back pays off. |
| Builders + upgrade timers | Facilities (unchanged): 1 builder, real-time timers |
| Train army | Squad and team sheet; the squad rests between matches (cooldown) |
| Attack | PLAY → matchmaking → Matchzone (or quick sim) |
| Stars | **0–3 stars** per match: draw = 1, win = 2, win by 2+ or with a clean sheet = 3 |
| Trophy league | Your **pyramid division** and rank, shown as a badge on the HUD |
| Daily goal | The challenge ("Win 3 matches within 24 hours") |

## Rhythm

- **5–30 seconds:** tap the coin bubble, start an upgrade, check a timer, read a headline.
- **2–4 minutes:** one match, watched at 2× by default (quick sim is instant), then the spoils.
- **Session (10–20 minutes):** collect, play until the squad is tired, spend on the next upgrade, check the league.
- **Days to weeks:** facility tiers, Level, the pyramid season (one Year = 28 game days), promotion or relegation.

## One shell

- `/`, `/u`, `/games` and login all land on the player's campus. The old manager dashboard screens fold into the Manager hub; only the year calendar and history still open the old app shell.
- Every HUD action opens **in the game**, as a drawer or a modal. Nothing navigates away except the World map, which is part of the game (it has its own dock and comes back to the campus).
  - Trophy → **League** drawer: my division table, my fixtures, other competitions.
  - Profile → the hub's Club tab.
  - Gear → **Settings**: sound, match speed, quick sim, the year calendar, sign out.
  - Dock "Manager" → the **Manager hub**, one drawer with tabs: Matchday, Team sheet, Squad, Transfers, Club, Analysis. Buildings are shortcuts into it: the Dugout opens Matchday, the Training Ground Squad, Scouting Transfers, the Office Club.
  - Deep links: `/game/:id?open=matchday|tactics|squad|transfers|club|analysis|league|settings`. The old club dashboard (`/u/clubs/:id/:code?tab=N`) and `/u` redirect managers into the hub. Admins keep the old screens.

## First session (onboarding)

1. The welcome card (inbox).
2. First steps, with a pulsing pointer on the control each step needs (on phones only the current step shows):
   1. **Collect your shop takings.** The till starts full, so the first tap pays.
   2. **Play your first match.** A new club starts with an auto-picked XI, so PLAY is never blocked by an empty team sheet.
   3. **Plan your next match.** The next-match chip opens Match prep.
   4. **Build a facility.**
   5. **Check your league.**
3. After that, the challenge card takes over as the standing goal.

## Feel

- Synthesised WebAudio SFX, no asset files: tap, open, coin, build start/finish, whistle, goal roar, win/loss stingers, level-up. One mute switch, saved per device.
- A coin burst flies to the treasury on collect, rewards count up, and a level-up gets its own beat.

## Economy (shop)

Shop income per real hour (scaled by `GAME_TIME_SCALE`) is `1,500 + 6 × fans + 1 × seats`. It builds up for up to `6 h + 2 h × Stands tier`. A new club makes about 3k an hour and can store about 18k, roughly one home match's gate. Tune it in `services/play/shop.ts`.

## Match day: book, prepare, watch

Players check in a few times a day, so the long horizon is the build-up to a match, not control inside it.

1. **Book.** Matchmaking offers *Play now* (an instant friendly) or *Book*. A booked match kicks off on the next free cup day (`WeekTemplate` 'C') at `CupKickoffHour`, at least a day out. A club can have 2 bookings waiting. The booker hosts and takes the gate. A booked match pays more than PLAY (60/25/10 XP; 80% of the gate on a win, at least 8k), settled once by the matchday runner (`settleBookedMatch`, guarded by `ChallengeStatus` going from accepted to played). Pyramid fixtures are already booked by the draw.
2. **Prep window.** *Match prep* (Manager › Matchday › a fixture) sets a plan for that fixture:
   - **Style:** Balanced, High Press, Possession, Low Block or Direct. Styles form a counter cycle: High Press > Possession > Low Block > Direct > High Press. Balanced is neutral against all of them.
   - **Formation,** plus optional slider overrides.
   - **Starting XI.** *Best XI* weighs fitness; *Rest tired players* rotates anyone below 75%.
   - **Half-time orders:** switch style if losing, level or winning at the break.
   - **Training session:** recovery (+20 starter fitness) or drills (sharper, scaled by Training Ground tier, −10 fitness).
   - **Team talk:** motivate lifts underdogs; demand lifts a confident favourite and backfires otherwise.
   - **Scouting report:** deeper with the Scouting Department. Tier 1 shows their style and its counter, tier 2 their key players, tier 3 their half-time orders.
   - **The assistant's read:** the real engine plays the plan 40 times (`POST /play/:club/fixtures/:id/preview`, sim `/sim/batch`, about 200 ms) and shows win/draw/loss odds with the factors behind them.

   The plan is stored on the fixture (`HomeTactic` / `AwayTactic` JSON). Without a plan, the club's saved team sheet plays. "Also make this my standing team sheet" writes it to the club.
3. **Kick-off.** The clock plays the fixture at its hour, online or not. A manager's matches now record a replay. For 5 minutes after kick-off the campus shows **LIVE**: the visitors' bus arrives, and *Watch live* joins the broadcast at the current minute at 1×. Later the result is in *While you were away* and the replay is in Matchday.

Not built: changing things *during* a live match. The engine can't pause and resume a simulation, and players who aren't online at kick-off would be punished. Conditional half-time orders give that effect asynchronously.

### Why decisions now matter (engine, `crates/sim-core`)

Measured with `cargo run --release --bin sim-lab -- 400 styles realism quality`:

- **Before:** High Press beat every style and Low Block lost to every style. 3-5-2 beat every formation. Player fitness and every per-match nudge (facilities, morale, form) did nothing, because the engine reads attributes and the nudges only changed `Rating`.
- **Now:**
  - The style matchup gives a ±5% skill edge to the side that counters (`counter_edge`, `tactics::style_matchup`). Pressers burn extra stamina (`press_drain`). Long and through balls beat the press (`lofted_pressure_factor`). A crowded box lowers shot quality (`shot_crowd`).
  - Each opposing style now has a different best answer. Balanced is never terrible.
  - Fitness carries into starting stamina at half weight (`fitness_carry`).
  - Nudges shift every attribute (`services/play/plan-effects.ts` `nudgeSkills`), so facilities, morale and plans reach the engine.
  - Home advantage is 0.04: home W/D/L is now 44/23/33.
- **Still open:** 3-5-2 is still the strongest formation. Goals (≈3.2 a game) and pass volume were already above the lab's targets.
