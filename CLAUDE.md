# fs-pro

## Competition model (open play + world pyramid)

The design lives in two specs:

- `docs/OPEN-PLAY-COMPETITIONS-SPEC.md`: competitions, editions, Level, Rank, challenges, knockouts and the board.
- `docs/WORLD-PYRAMID-SPEC.md`: placement, the pyramid leagues, the hourly calendar, caretakers and local news. Where the two disagree, this one wins.

Read both before touching competitions, seasons, fixtures, standings, the calendar clock, founding, news or the board.

Key concepts:

- **Level**: a club's progression, derived from `Clubs.XP` (higher = stronger;
  the same thing `ideas/persistent-strat-game` calls Club Level). It decides
  which competitions a club may enter. Promotion and relegation change a
  club's Level by setting its XP. Never store Level in its own column.
- **Division**: a club's level in its country's pyramid league, stored per
  edition on `Entries.Division` (1 = top). It is never stored on `Clubs`. The
  next draw moves a club by its pool finish: the top N go up, the bottom N go
  down.
- **Pool**: a group of clubs in one division that play a scheduled
  round-robin (`Pools`; `Entries.Group` = pool id).
- **Rank**: a club's position in a ranked (league/groups/pool) table.
  Per edition only; knockouts have no Rank, only the round reached.
- **Tier** is the word for facility grades (training ground, academy, etc.).
  Never call facility grades "Level" or "Division".
- **Competitions** other than the pyramid are built by the admin at any time,
  with their own entry conditions, stages (league / groups / knockout), win
  condition and rewards. "Cup" is only a label. One run of a competition is an
  **edition** (stored in `Seasons`).
- **Scheduling**: only pyramid fixtures are scheduled in advance, at the
  draw. Other league and group matches come from accepted challenges, and
  knockout ties are drawn when their round opens. Both play only on cup days
  (`WeekTemplate` 'C').
- **Booked match**: a friendly a manager books from matchmaking. It plays on
  the next free cup day (`Stage` 'booked', `ChallengeStatus` accepted →
  played once settled), and both sides get a prep window. A fixture's
  match plan lives in its `HomeTactic`/`AwayTactic` JSON. See
  `docs/CORE-LOOP.md`.
- **Board** judges a club's performance score across all competitions,
  compared with the target for its Level.
- **Year = Season** (28 game days by default). Year end finishes the pyramid
  editions and draws the next ones, then runs ageing, wages, retirement,
  youth intake and reports. It creates no other competitions.
- **Clock**: one game day = `DayLengthMinutes` (24 real hours by default),
  ticked hourly. Matches play at their `KickoffHour`.
- **Placement**: new clubs fill the world in order: town, then region, then
  country, then a new country. Invite links override this for a town. Never
  spawn AI clubs on founding.
- **News** is posted to the smallest place that holds its clubs and escalates
  to wider scopes by importance. Never broadcast every result to `world`.
- **Legacy** scheduled seasons live only on the `legacy/scheduled-seasons`
  branch. Never add a mode flag or dual code paths for them. Porting a
  utility from that branch (like `RoundRobin`) into the pyramid is fine.
