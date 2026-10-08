# B5A — formation balance (phase 1)

Tool: `sim-lab 400 realism quality styles formations` (400 seeded fixtures per
cell, i7-11800H). `cargo test --release` PASS after the change.

## Change

Two sim-core edits (no contract change):

1. **Formation matchup** (`tactics::formation_matchup`, applied in
   `engine::apply_style_edge` with new `CFG.formation_edge = 0.10`): no shape
   beats every other. 4-4-2 and 4-3-3 exploit a back three; 3-5-2's midfield
   overload beats 4-2-3-1; 4-2-3-1's double pivot smothers 4-3-3; 4-3-3's front
   three beats 4-4-2's flat four.
2. **Goal cap** (`CFG.max_goal_probability 0.9 → 0.33`): lowers the conversion
   of the best chances without changing the shooter's decision to shoot
   (`xG = sigmoid(situation)` is unchanged), bringing goals into range.

## Before → after

| Metric | Before | After | Target |
| --- | --- | --- | --- |
| Goals per match | 3.21 | **2.58** | 2.5–2.9 |
| Shots | 22.5 | 22.7 | 22–28 |
| On target | 8.1 | 7.7 | 8–10 |
| Quality explains goal diff | 47% | 51% | 30–45% |
| Style cycle intact | yes | yes | yes |

Formations, home points/match (rows = home vs column away):

```
BEFORE                         AFTER
        433  442  4231  352           433  442  4231  352
433     1.54 1.49 1.50  1.31   433    1.54 2.50 0.55  2.34
442     1.69 1.71 1.78  1.29   442    0.67 1.67 1.74  2.52
4231    1.63 1.60 1.45  1.39   4231   2.55 1.56 1.51  0.45
352     2.00 2.05 1.88  1.57   352    0.88 0.73 2.67  1.61
```

Before, **3-5-2 beat every other shape** (its row was ≥1.57 everywhere). After,
3-5-2 loses to 4-3-3 (0.88) and 4-4-2 (0.73) and only beats 4-2-3-1.

## Known gaps / risks

- **Quality rose to 51%** (target 30–45%), the opposite direction. The goal cap
  compresses totals, which makes the stronger XI's edge a larger share. This is
  a separate realism metric (BASELINE §3) not in B5A's two asks; it needs its
  own tuning pass (shot-quality variance or a stronger underdog/resilience
  term). Not fixed here.
- **Formation swings are large** (e.g. 4-2-3-1 vs 3-5-2 is 0.45 / 2.67). The
  0.10 skill edge is a blunt instrument; a follow-up should reduce 3-5-2's
  intrinsic anchor advantage so a smaller edge suffices. Left as a measured
  result, not hidden.
- Q4 invocation: `sim-lab 400 realism quality styles formations`
  (`crates/sim-core/src/bin/sim_lab.rs:10-11`).
