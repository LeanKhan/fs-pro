# Spec: World pyramid (placement, pyramid leagues, calendar, local news)

## Why

The world has to work with 10,000 players, which means roughly 10k clubs.

Open play (`OPEN-PLAY-COMPETITIONS-SPEC.md`) gave every country one challenge league of 20 clubs. Every founding also spawned AI rivals. News went to the whole world. At 10k players:

- most clubs would have nothing to enter;
- the AI would flood the towns;
- every client would receive every result.

This spec replaces those parts. Everything not mentioned here still follows the open-play spec: admin-built competitions, editions, Level, Rank, the board and performance score, challenges and knockouts.

## Summary

| Area | Before | Now |
| --- | --- | --- |
| Where a club lives | The founder picks any town, or founds a country or town anywhere | **Placement fills the world in order.** A town fills, then its region, then its country, and only then does a new country open. An invite link puts a friend in the inviter's town. |
| AI rivals | Up to 2 spawned per founding | **None.** Existing AI clubs stay. No new AI clubs are created. |
| National football | One 20-club challenge league per country | **One pyramid league per country.** Pools of 10 play a scheduled double round-robin. Divisions sit on top of each other, with promotion and relegation. |
| Season | Editions never depended on the year | **Year = Season = 28 game days.** Year end finishes the pyramid and draws the next one. |
| Clock | One game day per tick: 180 real minutes after a matchday, 10 after an off day | **One game day = 24 real hours, ticked hourly.** Matches kick off at hourly slots. A fixed week template gives league days and cup days. |
| Other competitions | Any day | Admin cups, events and challenge stages play on **cup days**. Async PvP (PLAY) runs any time. |
| Inactive humans | Nothing | **Caretaker** after 14 days. **Release** after 2 inactive seasons. |
| News | The world feed showed the last 15 results; every result went to the `world` topic | **Local scopes**: town, region, country, world. The bar to reach a wider scope rises with how busy it is. |

## Terms

| Term | Meaning |
| --- | --- |
| Region | A `Places` row with `Type='region'` under a country. It groups up to `RegionTowns` towns. |
| Placement | Choosing where a new club goes (`services/world/placement.service.ts`). |
| Pyramid league | A country's league competition. It has one stage of type `pyramid`, and one edition per Year. |
| Division | A level of a pyramid edition. 1 is the top. Stored per edition on `Entries.Division`, never on `Clubs`. "Tier" stays the word for facility grades only. |
| Pool | One group of clubs that play each other within a division. `Pools` table; `Entries.Group` holds the pool id. |
| Slot | A numbered place in a pool (`Entries.PoolSlot`, 0-based). The fixture list is generated over slots, so empty slots can be filled later. |
| Caretaker | A human club whose owner has been away for `CaretakerAfterDays` days. It is played by the AI rules, but stays owned. |
| Scope | Where a news item is shown: `town`, `region`, `country` or `world`. |

## Geography and placement

### Shape

`Places` has three levels, plus the world:

- **country**: `Type='country'`, with no parent.
- **region**: `Type='region'`, with `ParentId` = its country.
- **town**: `Type='town'`, with `ParentId` = its country (unchanged) and the new `RegionId` = its region.

Capacities are world settings on `Calendars`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `TownSize` | 6 | Clubs per town (replaces `TOWN_MAX_CLUBS` as the source of truth; the constant stays as the default) |
| `RegionTowns` | 8 | Towns per region |
| `CountryRegions` | 6 | Regions per country |

So a full country holds 288 clubs, and 10k clubs need about 35 countries.

### Fill order

`nextSpot({ inviteToken? })` runs under `pg_advisory_xact_lock` together with the club insert, so two foundings can't overfill a town. Without an invite, it returns the first spot from this list:

1. **A hole**: the oldest town in the world with fewer than `TownSize` clubs. Holes appear when a club is released.
2. **A new town** in the filling region: the open region with the fewest towns, in the newest country, if it has fewer than `RegionTowns` towns.
3. **A new region** in the newest country, if it has fewer than `CountryRegions` regions.
4. **A new country.**

The "filling" country is the most recently created country that isn't full. Older countries only receive holes. So the world grows from one place, and early players share towns.

Existing countries founded by hand count as normal countries. A country with no regions yet gets one when its first town is placed.

### Naming the new place

If the spot opens a new town, region or country, the founding request must name it:

- **New town**: the town name and terrain.
- **New region**: the region name, plus the town.
- **New country**: the country name, code, colours and motto, plus the region and the town.

The founder becomes the place's `FoundedBy`.

Validation uses the existing rules: `nameProblem` and `codeProblem` in `world-geo.ts`, with names unique within the parent, and country names and codes unique worldwide.

`GET /world/placement[?invite=TOKEN]` previews the spot so the `/start` form knows what to ask for. The preview is a hint only: `POST /world/clubs` runs placement again under the lock. If the world changed in between, for example someone else opened the town first, the server uses the new spot. If that spot needs names the request didn't send, it answers `409 needs-names` with a fresh preview.

### Invites

The `TownInvites` table: `Token` (random, unique), `TownId`, `ByClubId`, `ExpiresAt`, `MaxUses` (default 5), `Uses`.

- Any human club can create an invite for **its own town**, at most 5 live invites per club.
- A founding with a valid invite goes to that town if it has room.
- If the town is full, the club goes to the region's other towns with room. If there are none, the region gets a new town; invites may push a region past `RegionTowns` by one town. If that is also impossible, the founding falls back to normal placement and the response says so.
- `/start?invite=TOKEN` opens the founding flow with the invite applied.

### Map

Auto-placement needs room. Its geometry lives in `world-geo.ts`:

- **New countries**: centred on a golden-angle spiral out from the world centre, at least `COUNTRY_MIN_GAP` from every existing country.
- **New regions**: centred around their country at `REGION_RING` from the centre, at angle `k·60°` with small jitter.
- **New towns**: placed by `suggestTownSpot` around their region's centre.

The sea is no longer a fixed 1600×900. `getAtlas` returns `bounds` (minX, minY, maxX, maxY) computed from all places plus a margin, and the client fits that.

`getAtlas` returns countries, regions and towns with **club counts**, not club lists. `GET /world/towns/:id` (the existing town endpoint) returns a town's clubs. `world:founded` carries the new club and any new places as a patch.

### What goes away

- `spawnRivals` and the rival message.
- Public `POST /world/countries` and `POST /world/towns`. Places are only created through club founding. Admins may still create them through those routes, which become admin-only in `route-policy.ts`.
- `FOUNDING_LIMITS.countries` and `.towns` (a user founds a place only by being first there). `.clubs` (2) stays.

## Calendar

### Day and hour

- One game day = `DayLengthMinutes` real minutes (default 1440). The day has 24 **hours**.
- `Calendars.CurrentHour` is 0–23.
- The clock ticks once per hour: `DayLengthMinutes / 24` real minutes.
- `GAME_TIME_SCALE` divides the tick length, as it does for the rest of game time.

`runWorldHour()` runs on each tick:

| Hour | Work |
| --- | --- |
| 0 | **Day start**: year end (if due); heal past unplayed fixtures; editions tick; challenge expiry; competition AI; transfer window opening; caretaker sweep. |
| every hour h | Play fixtures with `ScheduledDay = today` and `KickoffHour = h`. Fixtures with no `KickoffHour` play at `CupKickoffHour`. |
| 23 (after its matches) | **Day end**: fitness recovery, AI transfer market, then `CurrentDay + 1` and `CurrentHour = 0`. |

- **Missed hours**: if a tick is late, any earlier kickoff of today still unplayed is played first, so a missed hour never loses matches.
- **Admin "advance now"** and `runWorldDay()` run all remaining hours of the day back to back, so the day loop stays a single call for tests and fast-forward.

`MatchdaySlotMinutes` and `OffDaySlotMinutes` are dropped. The admin clock panel edits `DayLengthMinutes` instead.

### Week template

- `Calendars.WeekTemplate` is a jsonb array of 7 day kinds. The default is `['L','C','L','L','C','L','L']`.
- The kind of a day = `WeekTemplate[(day - YearStartDay) mod 7]`.
- **L (league day)**: pyramid rounds play on L days, in order: round 1 on the first L day of the year, and so on. A 28-day year has 20 L days. A double round-robin of 10 uses 18 of them, and the last 2 are spare.
- **C (cup day)**: knockout ties and accepted challenges play only on C days. `findSlot` skips other days, and a tie's `PlayBy` is moved to the next C day on or after it. A 28-day year has 8 C days.

`dayKind(calendar, day)` lives in `packages/api-contract/src/world-calendar.ts`, so the client can label days.

### Kickoff hours

- Every pool gets a `KickoffHour` from `KickoffHours` (world setting, default `[12..22]` UTC), dealt in turn across all pools of all countries. This spreads about 5k league matches a day over 11 hours.
- `CupKickoffHour` defaults to 20.
- A club's lineup and tactics are read at kickoff. There is no separate deadline.

### Year = Season

- `YearLengthDays` defaults to **28**. Real time: 28 days at the default day length.
- Transfer windows default to days 1–7 and 15–18 of the year.
- Year end runs in this order (`year.service.ts`):
  1. **Finish the pyramid editions** (below), so their scores count in the closing year.
  2. `closeYear` (performance score and Level review).
  3. Player progression, wages, retirement, youth intake and club ratings, as today.
  4. **Release long-inactive clubs.**
  5. **Draw the next pyramid edition** for every country with clubs.
  6. Year report.
- Other editions still never depend on the year: they run across the boundary as before.

This replaces "Year never creates competitions" for the pyramid only. The Year creates the next pyramid edition and nothing else.

## Pyramid league

### Definition

One competition per country, created by `world-competitions.service.ts` `ensureNationalLeague`, code `NAT-<CODE>`, named "<Country> League". It replaces the Open League, and still uses `Entry.countryIds: [country]`.

```ts
// added to StageDefinitionSchema
{ type: 'pyramid';
  poolSize: number;       // default 10
  rounds: 1 | 2;          // default 2 (home and away)
  promote: number;        // default 2: top N of each pool go up a division
  relegate: number;       // default 2: bottom N of each filled pool go down
  bottomFill: number;     // default 0.8: share of bottom-division slots filled at the draw
  rules?: Partial<LeagueRules>; // table order; default metric 'points'; bottom division uses 'ppg'
}
```

Rules for a `pyramid` stage:

- It must be the only stage.
- `Entry.mode` is `'invite'`: placement and the draw add clubs, and clubs never register.
- `Recurrence` is null: the Year drives it.
- `tickEditions` skips editions whose only stage is `pyramid`. The pyramid service runs them.

### The draw (`pyramid.service.ts` `drawPyramid(competitionId, year)`)

Input: every club in the country (`AddressCountryId`), excluding released clubs.

**1. Desired division:**
- A club in last year's edition gets: last division − 1 if it finished in the top `promote` of its pool, + 1 if in the bottom `relegate` (counted over filled slots), and 0 otherwise. The minimum is 1.
- New clubs get `+∞`.

**2. Order:** desired division, then Level (descending), then XP (descending), then Elo (descending).

**3. Shape:** let N = the number of clubs and `cap(d) = 2^(d-1) · poolSize`.
- Division d is **full** while `N − filled − cap(d) ≥ 2`.
- The first division that would not be full is the **bottom** division. It gets `max(1, ceil(rest / (poolSize · bottomFill)))` pools, with clubs spread evenly. Remaining slots stay open.

**4. Pools within a division:**
- Order the division's clubs by (region, town) and cut them into pools in that order, so lower divisions are local.
- Division 1 is a single pool.

**5. Names:**
- Division 1: "<Country> Premier".
- Others: "<Country> D<n> · <most common region in the pool>", with " II", " III"… when names repeat.

**6. Rows written:**
- `Seasons`: one edition, `Status='running'`, `StartDay` = first day of the year, `EndDay` = last day.
- `Pools` rows.
- `Entries`: `Status='active'`, `Division`, `Group` = pool id, `PoolSlot`, `Seed` = order.
- Zeroed `Rankings` rows (`StageIndex 0`, `Group` = pool id).
- All fixtures.

**7. Fixtures:**
- Use the circle method (`utils/round-robin.ts`, ported from the legacy branch's `RoundRobin`) over **slot indices** `0..poolSize-1`.
- Round r plays on the r-th L day of the year, at the pool's `KickoffHour`.
- `rounds: 2` adds the reverse fixtures, with home and away swapped, in rounds `poolSize`…`2·poolSize−2`.
- A fixture row exists only when both slots are filled. Fields: `SeasonId`, `CompetitionId`, `StageIndex 0`, `Round`, `Stage 'lg-match'`, `ScheduledDay`, `KickoffHour`.

### Joining mid-season

When a club is founded in a country whose edition is running:

1. Find the bottom division's pools that have an open slot. Prefer the pool whose clubs share the new club's region, then the pool with the most open slots.
2. Take the lowest open slot: insert the `Entries` row and the `Rankings` row.
3. Insert the slot's fixtures for every remaining round (`ScheduledDay > today`) against filled slots.
4. If the bottom division has no open slot, add a new bottom-division pool.

Bottom-division tables rank by `ppg`, with `minGamesToRank = 4`. A late joiner is unranked until they reach it, and an unranked club can't be promoted or relegated.

The same happens when a country's first club is founded: its pyramid competition is created and drawn on the spot, as a one-division edition.

### Results

- League fixtures go through the normal seam: `updateFixture`, then `RankingService.applyResult`, which writes the pool's `Rankings` row.
- Tables per pool come from `getStageTable(seasonId, 0, poolId)`.

### Finish (year end)

`finishPyramid(seasonId)` runs before `closeYear`:

1. Play nothing new: leftover unplayed fixtures are played by the year-end heal first.
2. Rank each pool with its rules. Write `Entries.FinalPosition` (position within the pool) and `FinishScore`, using the same formula as other league finishes (`1 − (pos − 1)/(n − 1)`; unranked = 0).
3. **Rewards**, scaled by division:
   - Prize money: `base × 0.6^(d−1)` for positions 1–3, with base 400k / 200k / 100k.
   - XP: 250 / 120 / 60, also scaled by division.
   - Trophy: "<pool name> champions" for the winner of each pool. Division 1's winner gets "<Country> Champions".
4. **Level**: promoted clubs get +1 Level and relegated clubs −1, through the existing `level-change.ts` (source `promotion` / `relegation`). The next draw uses positions, not Level, to move divisions. Level keeps gating every other competition.
5. Set `Status='finished'` and `WinnerId` = division 1's winner.
6. Emit `edition:updated`.

## Other competitions

- The worldwide **Amateur Cup** stays, as an ordinary knockout on C days. Its `tieDays` counts C days: each round takes one C day.
- Admin competitions are unchanged, except that their matches only play on C days. A league or groups stage with `days: n` still runs n calendar days, but its challenges can only be scheduled on C days inside it.
- **PLAY** (async matchmade games) is unaffected by day kinds.

## Caretaker and release

- **`Clubs.LastActiveAt`**: set by auth middleware on any authenticated request by the club's owner, written at most once an hour per club.
- **Caretaker**: the day-start sweep sets `Clubs.Caretaker = true` for human clubs with `LastActiveAt` older than `CaretakerAfterDays` (default 14).
  - A caretaker club picks its lineup with the AI selection before each of its matches.
  - It accepts challenges like an AI club. It does not register for new competitions or trade.
  - The next authenticated request clears the flag.
- **Release** at year end: a human club that was a caretaker for the whole of the last `ReleaseAfterSeasons` years (default 2) is released:
  - `Clubs.ReleasedAt` is set, `UserId` is kept for history, and `TownId` is cleared, which frees the slot.
  - Its players become free agents.
  - It is excluded from draws, placement counts, matchmaking and the atlas.
  - The owner can't revive it; they can found a new club.

## News scopes

### Items

The `NewsItems` table:

| Column | Meaning |
| --- | --- |
| `ScopeType`, `ScopeId` | Where it was posted. Null id = world. |
| `Kind` | `result`, `upset`, `title`, `promotion`, `founded`, `transfer`, `record`, … |
| `Importance` | 0–100 |
| `Title`, `Body` | The item's text |
| `ClubIds` | The clubs involved |
| `FixtureId` | The match, if any |
| `Day`, `createdAt` | When it happened |

Index on (`ScopeType`, `ScopeId`, `createdAt DESC`).

### Where an item goes

1. **Natural scope** = the smallest place that contains every club in the item: their common town, else region, else country, else world.
2. Then **escalate**: post the item to the natural scope, and to each wider scope S while `Importance ≥ bar(S)`.

   `bar(S) = BASE[S] + K · log2(max(1, active(S) / TARGET[S]))`

   - `active(S)` = human clubs active in the last 7 days in S, cached once per game day.
   - Defaults: `BASE = { town: 0, region: 35, country: 60, world: 85 }`, `TARGET = { town: 6, region: 48, country: 288, world: 2000 }`, `K = 8`.

   A quiet region shows more of its town news, and a crowded country raises its bar, so each viewer sees a roughly constant flow.

Importance comes from the event:

| Event | Importance |
| --- | --- |
| Ordinary league result | 10 |
| Derby (same town) | +15 |
| Upset (Elo gap) | Up to +30 |
| Top-of-table clash | +10 |
| Promotion or relegation | 50 |
| Pool title | 60 |
| National title | 80 |
| Cup final | 70–90 by Prestige |
| Club founded | 20; 40 if it opened a new country |

Generation sits behind the existing result seam: `updateFixture`, then `applyMatchResult`, then the news step (`news-scope.service.ts` `postResultNews`). There is no second call site. Edition finishes and placement post their own items.

### Reading

- `GET /world/feed` (the existing world feed) returns the viewer's merged feed: their town, region, country and world items, newest first, paged.
- If the viewer's town has fewer than 3 active clubs, its "Local" tab reads the region instead. If the region has fewer than 10, it reads the country.
- Anonymous viewers get the world scope.

### Realtime

- Items are published to `town:<id>`, `region:<id>`, `country:<id>` and `world`, matching where they were posted.
- The gateway (`apps/fs-pro-realtime/hub.go`) lets anyone join those topics, and allows chat in `town:` topics.
- The client subscribes to its club's three places plus `world`.
- `world:result` for every human match is dropped. Results reach the world only as escalated news.
- The online count is broadcast at most once every 10 s.

## Data model changes

| Table | Change |
| --- | --- |
| `Places` | `RegionId uuid` (towns). `Type` may be `'region'`. |
| `Calendars` | `CurrentHour int default 0`, `DayLengthMinutes int default 1440`, `WeekTemplate jsonb`, `KickoffHours jsonb`, `CupKickoffHour int default 20`, `TownSize`, `RegionTowns`, `CountryRegions`, `CaretakerAfterDays`, `ReleaseAfterSeasons`. `YearLengthDays` default becomes 28. Drop `MatchdaySlotMinutes` and `OffDaySlotMinutes`. |
| `Pools` (new) | `id`, `SeasonId`, `Division`, `Name`, `RegionId`, `KickoffHour`, `Size`, `createdAt`. |
| `Entries` | `Division int`, `PoolSlot int`. |
| `Fixtures` | `KickoffHour int`. Index (`ScheduledDay`, `KickoffHour`). |
| `Clubs` | `LastActiveAt`, `Caretaker bool default false`, `ReleasedAt`. Index on `Rating`. `ShieldUntil` (PLAY defence shield). |
| `TownInvites` (new) | As above. |
| `NewsItems` (new) | As above. |

Migration `0035_world_pyramid.sql`:

1. Add the columns and tables above.
2. Backfill one or more regions per existing country, grouping its towns by angle around the country centre, `RegionTowns` per region.
3. Set the new calendar defaults and start a new 28-day year on the next day.
4. Cancel running and registering Open League editions (refunding fees, as `cancelEdition` does).
5. Create and draw each country's pyramid edition. This runs as a script after the migration (`scripts/migration/start-world-pyramid.ts`), since it needs application code.

## Removed

- `spawnRivals`, `RIVAL_PATTERNS`, the founding rival message.
- The national Open League definition.
- `MatchdaySlotMinutes`, `OffDaySlotMinutes`, and the "next tick after a matchday or off day" logic.
- Public country and town founding routes. They remain for admins.
- Whole-world `getAtlas` club lists, and the per-result `world:result` broadcast.

## Testing

- `scripts/checkPlacement.ts`: fill order, town cap under concurrency, invites, holes after release.
- `scripts/checkPyramidDraw.ts`:
  - the division shape for N = 1, 2, 12, 31, 288 and 1000;
  - locality grouping;
  - every filled pair meets `rounds` times;
  - a late joiner gets exactly the remaining rounds;
  - promotion and relegation move divisions and Level;
  - a second draw uses movement.
- `scripts/seed-scale-world.ts`: N clubs through real placement on a **scratch database**. Then time one season.
- The existing `checkEditionService.ts` and `checkChallengeService.ts` still pass, with challenges and ties landing on C days.
