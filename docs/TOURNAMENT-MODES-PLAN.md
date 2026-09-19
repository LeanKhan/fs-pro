# Tournament Modes Architecture & Implementation Plan: Champions League & FA Cup

This document outlines the architecture for introducing specialized tournament modes into the game engine, enabling **Regional Competitions** (e.g., *Champions League* with Group Stage + Knockout Bracket) and **Cup Competitions** (e.g., *FA Cup* with single-elimination knockout and penalty shootouts), complete with multi-competition calendar scheduling and interactive bracket/group UI.

---

## 1. Domain Model & Tournament Formats

### A. Domestic Cups (one per country, e.g. "The Association Cup" / `FAC-<country>`)
* **Format**: Single-elimination knockout. `Competition.CountryId` is set.
* **Participants**: *Every* club in that country, across all its leagues/divisions. Field size is computed, not hardcoded (currently 24 and 20).
* **Byes / bracket sizing**: the field is padded up to the next power of two. The top-rated clubs receive first-round byes; the rest play the first round (24 clubs -> 8 byes, 8 ties in the Round of 32; 20 clubs -> 12 byes, 4 ties). Seeding is by Rating (+ random tie-break); user clubs get no special treatment. Slot j plays slot (size-1-j) each round.
* **Rounds**: `Round of N` (first round, sized to the field), `Round of 16`, `quarter-final`, `semi-final`, `final` (`isFinalMatch: true`).
* **Match Resolution**: no draws. Level after 90 minutes -> penalty shootout (5 each + sudden death), stored in `Details.Penalties`, `Details.Winner`, `Details.Loser`, formatted e.g. `"1 - 1 (5 - 4 pens)"`.
* **Dynamic progression**: only the first round is generated on season creation. When a round finishes, winners (plus bye clubs) are paired into the next round on the next cup matchday. The Final winner is recorded as `WinnerId` on the Season.

### B. Continental Competition (e.g. "Continental Champions League" / `CCL`)
* **Scope**: one competition; the two countries are assumed to share a continent for now.
* **Qualification**: the **top 4 clubs of each league from the preceding season** (2 countries x 2 leagues x 4 = 16 clubs). Qualification is read from the previous season's final league standings.
  * **First season**: no preceding season exists, so the top 4 by club `Rating` in each league stand in once. Real results are used from season 2.
  * Qualifier membership is rebuilt when the next season cycle starts (`seedDefaultTournaments(year)`, called from `startNextSeasonCycle`), from the finished league seasons; a competition that already has a season for that year is left alone.
* **Phase 1: Group Stage**: 4 groups of 4 (A-D), double round-robin (6 matchdays). Groups are drawn from rating pots: the 16 clubs are ranked into 4 pots of 4, and each group gets one club per pot at random. Each group tracks Points, GD, GF, GA. Top 2 per group advance (8 clubs).
* **Phase 2: Knockout Stage**:
  - QF1: Winner A vs Runner-up B; QF2: Winner C vs Runner-up D; QF3: Winner B vs Runner-up A; QF4: Winner D vs Runner-up C
  - SF1: W(QF1) vs W(QF2); SF2: W(QF3) vs W(QF4); Grand Final: W(SF1) vs W(SF2)
  - Draws resolved by penalty shootout. The Final winner is crowned Continental Champion.

---

## 2. Server Architecture (`apps/fs-pro-server`)

### A. Tournament Engine Service (`src/services/competitions/tournament-engine.service.ts`)
Encapsulates all tournament logic:
- `seedDefaultTournaments()`: ensures one domestic cup per country (all clubs of that country as members, `CountryId` set) and the single continental competition. Continental membership comes from previous-season league standings (top 4 per league), with the rating-based fallback for the first season.
- `createCupInitialFixtures(...)`: computes bracket size from the field, assigns byes to top seeds, and generates the first round (preliminary or Round of 16).
- `createTournamentGroupFixtures(season, clubs)`: Seeds 4 Groups of 4 and generates 6 group matchdays.
- `checkAndAdvanceTournaments()`: Hooked into day advancement (`advanceDayIfDone`); detects completed Cup rounds and completed Group stages, automatically advancing winners into subsequent rounds.

### B. Match Engine Penalty Decider (`src/simulation/quick-sim/QuickSimResolver.ts`)
- If a fixture is `Type === 'cup'` or has a knockout stage (`'round-of-16'`, `'quarter-final'`, `'semi-final'`, `'final'`), a level score rolls a penalty shootout:
  - Generates realistic penalty scores (e.g. 5-4, 4-3, 3-2).
  - Designates `Details.Winner`, `Details.Loser`, `Details.Penalties`.
  - Appends penalty events to match timeline.

### C. Multi-Competition Calendar Scheduling (`src/controllers/calendar/calendar.router.ts`)
- In `arrangeSeasonFixturesAcrossDays`, interweave matches across the calendar so clubs participating in multiple competitions never have conflicting fixtures on the same day:
  - Day 1, 5, 9, 13, 17...: League Matchdays
  - Day 3, 7, 11, 15...: Champions League Group Matchdays
  - Day 4, 12, 20, 28...: Cup Knockout Matchdays

---

## 3. Client UI Architecture (`apps/fs-pro-client`)

### A. Knockout Bracket View (`src/components/competitions/knockout-bracket.vue`)
- Interactive tournament bracket rendering:
  - Columns for Round of 16, Quarter-Finals, Semi-Finals, and Final.
  - Club crests, names, scores (with penalty badges), and winner highlights.
  - Direct "Match Review" buttons to inspect populated MatchZone reviews for completed ties.

### B. Group Stage View (`src/components/competitions/group-stage-view.vue`)
- 4 Group Cards (Groups A, B, C, D) displaying:
  - Group Standings Table with Position, Club, Played, Won, Drawn, Lost, GD, Points.
  - Green qualification line for top 2 advancing teams.
  - Matchday results within each group.

### C. Dynamic Competition Dashboard (`src/views/admin/competitions/view-competition.vue`)
- Switches layout based on competition type:
  - `League`: Shows standard League Table and fixtures.
  - `Cup`: Shows the Knockout Bracket and active round.
  - `Tournament`: Shows Group Stage Tables + Knockout Bracket.

### D. Year Calendar & Day Scroll Branding
- Distinct color-coded pills for competitions:
  - `FAC` (Cup) in Gold / Amber (`mdi-trophy-award`).
  - `CCL` (Champions League) in Cyan / Electric Blue (`mdi-star-shooting`).
  - `KLV`/`EFL` (Leagues) in Indigo.
- Ability to filter Year Calendar by competition.

---

## 4. Scheduling & retired global cup
* League fixtures use odd day offsets; domestic cups start on day +2 and the continental group stage on day +4, and every knockout round / matchday is 8 days after the last, so cup days (=2 mod 8) and continental days (=4 mod 8) never share a day with each other or with a league day.
* The original single global `FAC` cup (no `CountryId`) is retired: it keeps its history but `startNextSeasonCycle` no longer creates seasons for it.
