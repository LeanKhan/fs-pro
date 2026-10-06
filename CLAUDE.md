# fs-pro

## Competition model (open play)

The design lives in `docs/OPEN-PLAY-COMPETITIONS-SPEC.md`. Read it before
touching competitions, seasons, fixtures, standings, the calendar clock, or the
board. Key concepts:

- **Level**: a club's progression, derived from `Clubs.XP` (higher = stronger;
  the same thing `ideas/persistent-strat-game` calls Club Level). It decides
  which competitions a club may enter and replaces fixed divisions. Promotion
  and relegation change a club's Level (by setting its XP). They never move a
  club between competitions. Never store Level in its own column.
- **Rank**: a club's position in a ranked (league/groups) competition table.
  Per edition only; knockouts have no Rank, only the round reached.
- **Tier** is the word for facility grades (training ground, academy, etc.).
  Never call facility grades "Level": Level only means the club's XP-based
  progression.
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
