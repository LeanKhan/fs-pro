# fs-pro

## Competition model (open play)

The design lives in `docs/OPEN-PLAY-COMPETITIONS-SPEC.md`. Read it before
touching competitions, seasons, fixtures, standings, the calendar clock, or the
board. Key concepts:

- **Level**: every club has a `Level` (1 = top). It replaces fixed divisions.
  Promotion and relegation change a club's Level. They never move a club
  between competitions.
- **Tier** is the word for facility grades (training ground, academy, etc.).
  Never call facility grades "Level": Level only means a club's standing.
- **Stratification** between competitions comes from qualify/bar outcomes and
  Level entry bands, not from divisions.
- **Competitions** are built by the admin at any time, with their own entry
  conditions, stages (league / groups / knockout), win condition and rewards.
  "Cup" is only a label. One run of a competition is an **edition** (stored in
  `Seasons`).
- **No pre-scheduled games**: league and group matches come from accepted
  challenges. Knockout ties are drawn when their round opens.
- **Board** judges a club's performance score across all competitions,
  compared with the target for its Level. There is no primary league.
- **Year** is a fixed-length period that rolls over automatically. It only
  drives ageing, wages, retirement, youth intake, reports and transfer
  windows. It never creates competitions.
- **Legacy** scheduled seasons live only on the `legacy/scheduled-seasons`
  branch. Never add a mode flag or dual code paths for them.
