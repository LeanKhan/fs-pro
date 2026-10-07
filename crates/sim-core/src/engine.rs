// crates/sim-core/src/engine.rs
//
// The match loop: 720 ticks of ~7.5 seconds. Each tick, players move
// (pressing, shape, runs), then the ball carrier either loses a challenge
// or acts. Every probability comes from `model`, the same functions the
// Decider used to choose the action.

use crate::config::CFG;
use crate::decider::{self, ActionChoice};
use crate::geom::{Vec2, PITCH_LENGTH_METERS};
use crate::model::{self, PassKind, ShotKind};
use crate::tactics::{compute_dynamic_anchor, style_matchup, TeamTactics};
use crate::types::*;
use rand::Rng;
use rand::SeedableRng;
use rand_xoshiro::Xoshiro256PlusPlus;

pub const TICKS_PER_MINUTE: u16 = 8;
pub const HALF_TIME_TICK: u16 = 45 * TICKS_PER_MINUTE; // 360
pub const FULL_TIME_TICK: u16 = 90 * TICKS_PER_MINUTE; // 720

/// Player-rating points per action - the same weights as the TypeScript
/// engine's `GamePoints`, so MOTM and stored match ratings mean the same.
mod points {
    pub const PASS: f32 = 0.25;
    pub const GOAL: f32 = 1.0;
    pub const SAVE: f32 = 1.0;
    pub const TACKLE: f32 = 0.25;
    pub const DRIBBLE: f32 = 0.5;
    pub const ASSIST: f32 = 0.5;
    pub const INTERCEPTION: f32 = 0.25;
}

/// Counters for calibration (sim-lab's `diag` section); not part of the
/// match output.
#[derive(Debug, Clone, Default)]
pub struct Diagnostics {
    /// Shoot, pass, carry, take-on, hold, clear.
    pub decisions: [u32; 6],
    /// Short, backward, wide, long, through, cross.
    pub pass_kinds: [u32; 6],
    /// Open-play shots by distance: <8m, 8-12, 12-16.5, 16.5-25, 25+.
    pub shot_distance: [u32; 5],
    pub headers: u32,
    pub cross_zone_ticks: u32,
    pub box_mates: u32,
    pub carrier_ticks: u32,
    pub penalties: u32,
    pub contact_ticks: u32,
    pub challenges: u32,
}

/// Conditional half-time orders: the style to switch to, by the score at
/// the break. `None` keeps the current plan.
#[derive(Debug, Clone, Default)]
pub struct HalfTimeOrders {
    pub losing: Option<String>,
    pub drawing: Option<String>,
    pub winning: Option<String>,
}

pub struct MatchEngine {
    pub players: [SimPlayer; 22],
    pub ball: SimBall,
    pub home_tactics: TeamTactics,
    pub away_tactics: TeamTactics,
    pub home_stats: TeamMatchStats,
    pub away_stats: TeamMatchStats,
    pub player_stats: [PlayerMatchStats; 22],
    pub events: Vec<EngineEvent>,
    /// Score at the half-time whistle (home, away).
    pub half_time_score: (u8, u8),
    /// The manager's half-time orders per side (home, away): a style to
    /// switch to when losing / drawing / winning at the break.
    pub half_time_orders: [HalfTimeOrders; 2],
    /// The style each side switched to at half time, if any (for reports).
    pub half_time_switch: [Option<String>; 2],
    /// Replay frames, recorded compactly (see `PackedFrames`).
    pub replay: ReplayBuffer,
    /// Capture a replay frame every tick (off for headless runs).
    pub record_frames: bool,
    /// (sent off, yellows, reds) as of the last captured frame.
    last_status: [(bool, u8, u8); 22],
    pub rng: Xoshiro256PlusPlus,
    pub current_tick: u16,
    pub attacking_left_to_right_home: bool,
    /// Last completed pass (passer, receiver) in the current possession -
    /// the receiver scoring credits the passer with the assist.
    last_pass: Option<(usize, usize)>,
    pub diag: Diagnostics,
    /// Tick-by-tick log of the carrier's decisions (sim-lab `trace`).
    pub trace: Option<Vec<String>>,
}

impl MatchEngine {
    /// `home_players`/`away_players` must be in formation-slot order:
    /// index 0 is the goalkeeper, index 10 takes kick-offs.
    pub fn new(
        home_players: Vec<SimPlayer>,
        away_players: Vec<SimPlayer>,
        home_tactics: TeamTactics,
        away_tactics: TeamTactics,
        seed: u64,
    ) -> Self {
        assert_eq!(home_players.len(), 11);
        assert_eq!(away_players.len(), 11);

        let mut players: [SimPlayer; 22] =
            std::array::from_fn(|i| if i < 11 { home_players[i].clone() } else { away_players[i - 11].clone() });

        for i in 0..11 {
            let home_anchor = home_tactics.slots[i].anchor;
            players[i].anchor_pos = home_anchor;
            players[i].pos = home_anchor;
            players[i].team_index = 0;
            players[i].squad_index = i;
            players[i].boost = 1.0 + CFG.home_advantage;

            // Away team faces the opposite direction in the 1st half.
            let mut away_anchor = away_tactics.slots[i].anchor;
            away_anchor.x = 1.0 - away_anchor.x;
            players[11 + i].anchor_pos = away_anchor;
            players[11 + i].pos = away_anchor;
            players[11 + i].team_index = 1;
            players[11 + i].squad_index = i;
            players[11 + i].boost = 1.0;
        }

        let mut engine = Self {
            players,
            ball: SimBall::default(),
            home_tactics,
            away_tactics,
            home_stats: TeamMatchStats::default(),
            away_stats: TeamMatchStats::default(),
            player_stats: std::array::from_fn(|_| PlayerMatchStats::default()),
            events: Vec::new(),
            half_time_score: (0, 0),
            half_time_orders: [HalfTimeOrders::default(), HalfTimeOrders::default()],
            half_time_switch: [None, None],
            replay: ReplayBuffer::default(),
            record_frames: true,
            last_status: [(false, 0, 0); 22],
            rng: Xoshiro256PlusPlus::seed_from_u64(seed),
            current_tick: 0,
            attacking_left_to_right_home: true,
            last_pass: None,
            diag: Diagnostics::default(),
            trace: None,
        };
        engine.kick_off(0);
        engine.apply_style_edge();
        engine
    }

    /// Runs the entire 90-minute match (720 ticks).
    pub fn simulate_full_match(&mut self) {
        while self.current_tick < FULL_TIME_TICK {
            self.step_tick();
        }
        self.record(FULL_TIME_TICK - 1, EventKind::FullTime, None, None, None);

        // Clean sheets: the goalkeeper and defenders of a side that kept one.
        for (team, conceded) in [(0, self.away_stats.score), (1, self.home_stats.score)] {
            if conceded == 0 {
                for i in team * 11..team * 11 + 11 {
                    if matches!(self.players[i].position, PositionCategory::GK | PositionCategory::DEF) {
                        self.player_stats[i].clean_sheets = 1;
                    }
                }
            }
        }
    }

    /// Executes one discrete simulation tick (~7.5 seconds of game time).
    pub fn step_tick(&mut self) {
        let tick = self.current_tick;
        let minute = (tick / TICKS_PER_MINUTE) as u8;

        if tick == 0 {
            self.record(tick, EventKind::KickOff, None, None, None);
        }

        if tick == HALF_TIME_TICK {
            self.half_time_score = (self.home_stats.score, self.away_stats.score);
            self.record(tick, EventKind::HalfTime, None, None, None);
            self.attacking_left_to_right_home = !self.attacking_left_to_right_home;
            for p in &mut self.players {
                p.stamina += (100.0 - p.stamina) * CFG.halftime_recovery;
            }
            self.apply_half_time_orders();
            self.kick_off(1);
        }

        self.move_players();

        match self.ball.holder_idx {
            Some(holder) => {
                if self.players[holder].team_index == 0 {
                    self.home_stats.possession_ticks += 1;
                } else {
                    self.away_stats.possession_ticks += 1;
                }
                self.handle_ball_carrier(holder, minute, tick);
            }
            None => self.collect_loose_ball(),
        }

        if self.record_frames {
            self.capture_frame(tick, minute);
        }
        self.current_tick += 1;
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    fn ltr(&self, team: usize) -> bool {
        (team == 0) == self.attacking_left_to_right_home
    }

    fn tactics(&self, team: usize) -> &TeamTactics {
        if team == 0 { &self.home_tactics } else { &self.away_tactics }
    }

    fn active(&self, i: usize) -> bool {
        !self.players[i].is_sent_off
    }

    /// The player in goal for `team`: the goalkeeper, or - if he's been
    /// sent off - the outfielder best at keeping. None if nobody is left.
    fn keeper_of(&self, team: usize) -> Option<usize> {
        let gk = team * 11;
        if self.active(gk) {
            return Some(gk);
        }
        (team * 11..team * 11 + 11)
            .filter(|&i| self.active(i))
            .max_by(|&a, &b| self.players[a].attributes.keeping.total_cmp(&self.players[b].attributes.keeping))
    }

    /// Active player of `team` nearest to `p` (outfielders first).
    fn nearest_of(&self, team: usize, p: Vec2) -> usize {
        (team * 11..team * 11 + 11)
            .filter(|&i| self.active(i))
            .min_by(|&a, &b| {
                let gk = |i: usize| (self.players[i].position == PositionCategory::GK) as u8;
                gk(a).cmp(&gk(b)).then(model::dist_m(self.players[a].pos, p).total_cmp(&model::dist_m(self.players[b].pos, p)))
            })
            .unwrap_or(team * 11)
    }

    fn record(&mut self, tick: u16, kind: EventKind, player: Option<usize>, other: Option<usize>, xg: Option<f32>) {
        if let Some(t) = self.trace.as_mut() {
            t.push(format!("      >>> {:?} by #{:?} xG {:?}", kind, player.map(|p| p % 11), xg));
        }
        self.events.push(EngineEvent { tick, minute: (tick / TICKS_PER_MINUTE) as u8, kind, player, other, xg });
    }

    /// `team` kicks off: its centre-forward (slot 10, or the nearest active
    /// outfielder) on the centre spot with the ball.
    fn kick_off(&mut self, team: usize) {
        let centre = Vec2::new(0.5, 0.5);
        let kicker = if self.active(team * 11 + 10) { team * 11 + 10 } else { self.nearest_of(team, centre) };
        self.players[kicker].pos = centre;
        self.ball.pos = centre;
        self.ball.holder_idx = Some(kicker);
        self.last_pass = None;
    }

    /// Possession passes to `idx` (tackle, interception, save...).
    fn give_ball_to(&mut self, idx: usize) {
        self.ball.holder_idx = Some(idx);
        self.ball.pos = self.players[idx].pos;
        self.last_pass = None;
    }

    fn team_stats(&mut self, team: usize) -> &mut TeamMatchStats {
        if team == 0 { &mut self.home_stats } else { &mut self.away_stats }
    }

    /// Books a player; a second yellow is a red. Returns the card shown.
    fn book(&mut self, idx: usize, card: CardState) -> CardState {
        if card == CardState::None {
            return CardState::None;
        }
        let team = self.players[idx].team_index;
        let second_yellow = card == CardState::Yellow && self.players[idx].cards == CardState::Yellow;
        if card == CardState::Yellow {
            self.player_stats[idx].yellow_cards += 1;
            self.team_stats(team).yellow_cards += 1;
        }
        if card == CardState::Red || second_yellow {
            self.player_stats[idx].red_cards += 1;
            self.team_stats(team).red_cards += 1;
            self.players[idx].cards = CardState::Red;
            self.players[idx].is_sent_off = true;
            CardState::Red
        } else {
            self.players[idx].cards = CardState::Yellow;
            CardState::Yellow
        }
    }

    /// A foul by `offender` on `victim`. In the victim's attacking box it's
    /// a penalty; otherwise the victim's side keeps the ball (free kick).
    fn handle_foul(&mut self, offender: usize, victim: usize, tick: u16) {
        let roll: f32 = self.rng.r#gen();
        let card = if roll < CFG.red_share {
            CardState::Red
        } else if roll < CFG.red_share + CFG.yellow_share {
            CardState::Yellow
        } else {
            CardState::None
        };
        let victim_team = self.players[victim].team_index;
        let penalty = model::in_attacking_box(self.players[victim].pos, self.ltr(victim_team));

        self.player_stats[offender].fouls += 1;
        let off_team = self.players[offender].team_index;
        self.team_stats(off_team).fouls += 1;
        let shown = self.book(offender, card);
        self.record(tick, EventKind::Foul { card: shown, penalty }, Some(offender), Some(victim), None);

        if penalty {
            self.execute_penalty(victim_team, tick);
        } else {
            self.give_ball_to(victim);
        }
    }

    // -----------------------------------------------------------------
    // Movement
    // -----------------------------------------------------------------

    /// Everyone but the ball carrier moves one tick towards a target: the
    /// defending side sends pressers at the ball (more for a high-pressing
    /// side) while the rest keep shape; the attacking side keeps shape with
    /// its forwards on the shoulder of the last defender. Distance covered
    /// drains stamina, so pressing has a cost.
    /// Skill boost from the style matchup, on top of home advantage. Re-run
    /// whenever a side changes style (half-time orders).
    fn apply_style_edge(&mut self) {
        let edge = style_matchup(&self.home_tactics.style_name, &self.away_tactics.style_name) * CFG.counter_edge;
        for i in 0..22 {
            let home = i < 11;
            let base = if home { 1.0 + CFG.home_advantage } else { 1.0 };
            self.players[i].boost = base * (1.0 + if home { edge } else { -edge });
        }
    }

    fn apply_half_time_orders(&mut self) {
        let (h, a) = self.half_time_score;
        for team in 0..2 {
            let (own, opp) = if team == 0 { (h, a) } else { (a, h) };
            let orders = &self.half_time_orders[team];
            let style = if own < opp {
                orders.losing.clone()
            } else if own == opp {
                orders.drawing.clone()
            } else {
                orders.winning.clone()
            };
            let Some(style) = style else { continue };
            let current = if team == 0 { &self.home_tactics } else { &self.away_tactics };
            if current.style_name == style {
                continue;
            }
            let mut next = TeamTactics::new(&current.formation_name, Some(&style), None, None, None, None, None, None, None);
            next.slots = current.slots.clone();
            if team == 0 {
                self.home_tactics = next;
            } else {
                self.away_tactics = next;
            }
            self.half_time_switch[team] = Some(style);
        }
        self.apply_style_edge();
    }

    fn move_players(&mut self) {
        let ball_pos = self.ball.pos;
        let holder = self.ball.holder_idx;
        let holder_team = holder.map(|h| self.players[h].team_index);

        // Pressers: the defending side's outfielders nearest the ball,
        // weighted by how eagerly their role presses.
        let mut pressers: Vec<usize> = Vec::new();
        if let (Some(h), Some(att)) = (holder, holder_team) {
            let def = 1 - att;
            let intensity = self.tactics(def).pressing_intensity;
            let zone_m = (CFG.press_zone_base + intensity * CFG.press_zone_per_intensity) * PITCH_LENGTH_METERS;
            // Distance of the ball from the defending side's own goal.
            let ball_depth = PITCH_LENGTH_METERS - model::fwd_m(ball_pos, self.ltr(att));
            let n = if ball_depth <= zone_m {
                (CFG.pressers_base + intensity * CFG.pressers_per_intensity).round() as usize
            } else {
                1
            };
            let mut cands: Vec<(usize, f32)> = (def * 11..def * 11 + 11)
                .filter(|&i| self.active(i) && self.players[i].position != PositionCategory::GK)
                .map(|i| {
                    let eagerness = 1.3 - 0.6 * self.players[i].role.tendencies().pressing_effort;
                    (i, model::dist_m(self.players[i].pos, self.players[h].pos) * eagerness)
                })
                .collect();
            cands.sort_by(|a, b| a.1.total_cmp(&b.1));
            pressers = cands.into_iter().take(n).map(|(i, _)| i).collect();
        }

        // Marking: with the ball in their half, the defending side's
        // outfielders who aren't pressing pick up the attackers nearest
        // their goal (most dangerous first, nearest free marker each) and
        // stand goal-side of them - so a ball into the box is contested.
        let mut marks: [Option<Vec2>; 22] = [None; 22];
        if let (Some(h), Some(att)) = (holder, holder_team) {
            let def = 1 - att;
            let att_ltr = self.ltr(att);
            let goal = model::goal_of(att_ltr);
            if model::fwd_m(ball_pos, att_ltr) > PITCH_LENGTH_METERS * 0.5 {
                let mut threats: Vec<usize> = (att * 11..att * 11 + 11)
                    .filter(|&i| {
                        i != h
                            && self.active(i)
                            && self.players[i].position != PositionCategory::GK
                            && model::dist_m(self.players[i].pos, goal) <= CFG.mark_zone_m
                    })
                    .collect();
                threats.sort_by(|&a, &b| model::dist_m(self.players[a].pos, goal).total_cmp(&model::dist_m(self.players[b].pos, goal)));
                let mut free: Vec<usize> = (def * 11..def * 11 + 11)
                    .filter(|&i| self.active(i) && self.players[i].position != PositionCategory::GK && !pressers.contains(&i))
                    .collect();
                for t in threats {
                    let tp = self.players[t].pos;
                    let Some(k) = (0..free.len()).min_by(|&a, &b| {
                        model::dist_m(self.players[free[a]].pos, tp).total_cmp(&model::dist_m(self.players[free[b]].pos, tp))
                    }) else {
                        break;
                    };
                    marks[free.remove(k)] = Some(model::towards(tp, goal, CFG.mark_distance_m));
                }
            }
        }

        let line = [
            model::offside_line_m(&self.players, 0, self.ltr(0)),
            model::offside_line_m(&self.players, 1, self.ltr(1)),
        ];

        // Ball wide in the final third: a crossing position. Forwards and
        // box-arriving midfielders attack the near post, penalty spot, far
        // post and edge of the box; the defending back line drops into the
        // box to meet them.
        let mut box_runs: [Option<Vec2>; 22] = [None; 22];
        let crossing_side = holder_team.filter(|&t| {
            let ltr = self.ltr(t);
            ((ball_pos.y - 0.5) * crate::geom::PITCH_WIDTH_METERS).abs() >= CFG.cross_wide_m
                && model::fwd_m(ball_pos, ltr) >= CFG.cross_from_fwd_m
        });
        if let Some(att) = crossing_side {
            let ltr = self.ltr(att);
            let side = if ball_pos.y > 0.5 { 1.0 } else { -1.0 };
            let spot = |depth_m: f32, y: f32| {
                let fwd = (PITCH_LENGTH_METERS - depth_m) / PITCH_LENGTH_METERS;
                Vec2::new(if ltr { fwd } else { 1.0 - fwd }, y)
            };
            let spots = [spot(6.0, 0.5 + side * 0.06), spot(11.0, 0.5), spot(7.0, 0.5 - side * 0.08), spot(17.0, 0.5 + side * 0.02)];
            let mut runners: Vec<usize> = (att * 11..att * 11 + 11)
                .filter(|&i| {
                    Some(i) != holder
                        && self.active(i)
                        && (self.players[i].position == PositionCategory::ATT
                            || (self.players[i].position == PositionCategory::MID && self.players[i].role.tendencies().forward_runs >= 0.75))
                })
                .collect();
            // Strikers first, then the nearest arrivals.
            runners.sort_by(|&a, &b| {
                let striker = |i: usize| (self.players[i].position != PositionCategory::ATT) as u8;
                striker(a).cmp(&striker(b)).then(model::dist_m(self.players[a].pos, spots[0]).total_cmp(&model::dist_m(self.players[b].pos, spots[0])))
            });
            for (r, s) in runners.into_iter().zip(spots) {
                box_runs[r] = Some(s);
            }
        }

        for i in 0..22 {
            if Some(i) == holder || !self.active(i) {
                continue;
            }
            let team = self.players[i].team_index;
            let ltr = self.ltr(team);
            let has_ball = holder_team == Some(team);
            let tactics = self.tactics(team);
            let slot = &tactics.slots[self.players[i].squad_index];

            let target = if pressers.contains(&i) {
                self.players[holder.unwrap()].pos
            } else if let Some(mark) = marks[i] {
                mark
            } else {
                let mut t = box_runs[i].unwrap_or_else(|| compute_dynamic_anchor(slot, ltr, ball_pos, has_ball, tactics));
                if !has_ball && crossing_side.is_some() && self.players[i].position == PositionCategory::DEF {
                    // Defending a cross: the back line drops into the box.
                    let fwd = model::fwd_m(t, ltr).min(10.0);
                    t.x = if ltr { fwd / PITCH_LENGTH_METERS } else { 1.0 - fwd / PITCH_LENGTH_METERS };
                }
                // Box runs are timed to arrive with the cross, so they aren't
                // held onside here (and crosses aren't flagged offside).
                if has_ball && self.players[i].position != PositionCategory::GK && box_runs[i].is_none() {
                    // Stay onside: never beyond the last defender (or the ball).
                    let max_fwd = (line[team] - CFG.onside_margin_m).max(model::fwd_m(ball_pos, ltr));
                    let mut fwd = model::fwd_m(t, ltr);
                    if self.players[i].position == PositionCategory::ATT {
                        fwd = max_fwd; // on the shoulder of the last defender
                    }
                    fwd = fwd.min(max_fwd);
                    t.x = if ltr { fwd / PITCH_LENGTH_METERS } else { 1.0 - fwd / PITCH_LENGTH_METERS };
                }
                t
            };

            let p = &self.players[i];
            let step_m = (CFG.step_base_m + p.attributes.speed / 100.0 * CFG.step_per_speed_m) * model::fatigue_multiplier(p);
            let gap = model::dist_m(p.pos, target);
            let moved = gap.min(step_m);
            if gap > 1e-3 {
                let (a, b) = (model::to_m(p.pos), model::to_m(target));
                let k = moved / gap;
                self.players[i].pos = model::from_m(Vec2::new(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)).clamp_pitch();
            }
            self.players[i].target_pos = target;
            self.drain(i, moved);
            if pressers.contains(&i) {
                let p = &mut self.players[i];
                let mitigation = 1.0 - CFG.stamina_mitigation * p.attributes.stamina / 100.0;
                p.stamina = (p.stamina - CFG.press_drain * mitigation).max(0.0);
            }
        }
        if let Some(h) = holder {
            self.drain(h, CFG.carry_step_m * 0.5);
        }
    }

    fn drain(&mut self, i: usize, moved_m: f32) {
        let tempo = self.tactics(self.players[i].team_index).tempo;
        let p = &mut self.players[i];
        let mitigation = 1.0 - CFG.stamina_mitigation * p.attributes.stamina / 100.0;
        let pace = 1.0 + CFG.tempo_drain * (tempo - 0.5);
        p.stamina = (p.stamina - (CFG.drain_base + CFG.drain_per_m * moved_m) * mitigation * pace).max(0.0);
    }

    // -----------------------------------------------------------------
    // The ball carrier
    // -----------------------------------------------------------------

    fn handle_ball_carrier(&mut self, carrier: usize, _minute: u8, tick: u16) {
        let team = self.players[carrier].team_index;
        let opp = 1 - team;
        let ltr = self.ltr(team);

        // A challenge from the nearest opponent, if he's close enough and
        // commits to it.
        let challenger = (opp * 11..opp * 11 + 11)
            .filter(|&i| self.active(i))
            .map(|i| (i, model::dist_m(self.players[i].pos, self.players[carrier].pos)))
            .filter(|&(_, d)| d <= CFG.contact_m)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, _)| i);
        self.diag.carrier_ticks += 1;
        {
            let p = self.players[carrier].pos;
            if ((p.y - 0.5) * crate::geom::PITCH_WIDTH_METERS).abs() >= CFG.cross_wide_m && model::fwd_m(p, ltr) >= CFG.cross_from_fwd_m {
                self.diag.cross_zone_ticks += 1;
                self.diag.box_mates += (team * 11..team * 11 + 11)
                    .filter(|&i| i != carrier && self.active(i) && model::in_attacking_box(self.players[i].pos, ltr))
                    .count() as u32;
            }
        }
        if let Some(d) = challenger {
            self.diag.contact_ticks += 1;
            let pressing = self.tactics(opp).pressing_intensity;
            if self.rng.r#gen::<f32>() < model::engage_probability(&self.players[d], pressing) {
                self.diag.challenges += 1;
                let won = self.rng.r#gen::<f32>() < model::tackle_probability(&self.players[d], &self.players[carrier]);
                let in_box = model::in_attacking_box(self.players[carrier].pos, ltr);
                if self.rng.r#gen::<f32>() < model::foul_probability(&self.players[d], won, in_box) {
                    self.handle_foul(d, carrier, tick);
                    return;
                }
                if won {
                    self.won_tackle(d);
                    return;
                }
                // Beaten: the carrier rides the challenge and plays on.
                self.player_stats[carrier].dribbles += 1;
                self.player_stats[carrier].points += points::DRIBBLE;
            }
        }

        let keeper = self.keeper_of(opp);
        let tactics = if team == 0 { &self.home_tactics } else { &self.away_tactics };
        let action = decider::decide(carrier, &self.players, tactics, ltr, keeper, &mut self.rng);
        if self.trace.is_some() {
            let p = &self.players[carrier];
            let goal = model::goal_of(ltr);
            let near = |r: f32| model::pressure_at(p.pos, &self.players, team, r);
            let line = model::offside_line_m(&self.players, team, ltr);
            let what = match action {
                ActionChoice::Pass { target_idx, kind, target } => format!(
                    "pass {:?} -> #{} ({:.0}m from goal, {} opp within 3m)",
                    kind,
                    target_idx % 11,
                    model::dist_m(target, goal),
                    model::pressure_at(target, &self.players, team, 3.0)
                ),
                other => format!("{:?}", other).chars().take(40).collect(),
            };
            let line_text = format!(
                "t{:>3} {} #{:<2} {:?} at {:>4.1}m from goal (fwd {:>4.1}, line {:>4.1}) opp<2.5m {} <10m {} | {}",
                self.current_tick,
                if team == 0 { "H" } else { "A" },
                carrier % 11,
                p.position,
                model::dist_m(p.pos, goal),
                model::fwd_m(p.pos, ltr),
                line,
                near(2.5),
                near(10.0),
                what
            );
            self.trace.as_mut().unwrap().push(line_text);
        }
        self.diag.decisions[match action {
            ActionChoice::Shoot => 0,
            ActionChoice::Pass { kind, .. } => {
                self.diag.pass_kinds[kind as usize] += 1;
                1
            }
            ActionChoice::Carry { .. } => 2,
            ActionChoice::TakeOn { .. } => 3,
            ActionChoice::Hold => 4,
            ActionChoice::Clear { .. } => 5,
        }] += 1;

        match action {
            ActionChoice::Shoot => self.shoot(carrier, keeper, ShotKind::OpenPlay, tick),
            ActionChoice::Pass { target_idx, target, kind } => self.pass(carrier, target_idx, target, kind, tick),
            ActionChoice::Carry { to } => {
                self.players[carrier].pos = to;
                self.ball.pos = to;
            }
            ActionChoice::TakeOn { defender_idx, to } => {
                if self.rng.r#gen::<f32>() < model::dribble_probability(&self.players[carrier], &self.players[defender_idx], &self.players) {
                    self.player_stats[carrier].dribbles += 1;
                    self.player_stats[carrier].points += points::DRIBBLE;
                    self.players[carrier].pos = to;
                    self.ball.pos = to;
                } else if self.rng.r#gen::<f32>()
                    < model::foul_probability(&self.players[defender_idx], true, model::in_attacking_box(self.players[carrier].pos, ltr))
                {
                    self.handle_foul(defender_idx, carrier, tick);
                } else {
                    self.won_tackle(defender_idx);
                }
            }
            ActionChoice::Hold => {}
            ActionChoice::Clear { to } => {
                self.ball.holder_idx = None;
                self.ball.pos = to;
                self.last_pass = None;
            }
        }
    }

    fn won_tackle(&mut self, tackler: usize) {
        self.player_stats[tackler].tackles += 1;
        self.player_stats[tackler].points += points::TACKLE;
        let team = self.players[tackler].team_index;
        self.team_stats(team).tackles += 1;
        self.give_ball_to(tackler);
    }

    fn pass(&mut self, passer: usize, receiver: usize, target: Vec2, kind: PassKind, tick: u16) {
        let team = self.players[passer].team_index;
        self.team_stats(team).passes += 1;

        let tempo = self.tactics(team).tempo;
        let pm = model::pass_model(&self.players[passer], &self.players[receiver], target, kind, &self.players, tempo);
        if self.rng.r#gen::<f32>() < pm.p_complete {
            self.team_stats(team).passes_completed += 1;
            self.player_stats[passer].passes += 1;
            self.player_stats[passer].points += points::PASS;
            // A through ball is collected where it was played, in space.
            self.players[receiver].pos = target;
            self.give_ball_to(receiver);
            self.last_pass = Some((passer, receiver));
            if kind == PassKind::Cross {
                let keeper = self.keeper_of(1 - team);
                self.shoot(receiver, keeper, ShotKind::Header, tick);
            }
        } else {
            let winner = pm.interceptor.unwrap_or_else(|| self.nearest_of(1 - team, target));
            self.player_stats[winner].interceptions += 1;
            self.player_stats[winner].points += points::INTERCEPTION;
            self.player_stats[passer].points -= points::INTERCEPTION;
            self.give_ball_to(winner);
        }
    }

    fn shoot(&mut self, shooter: usize, keeper: Option<usize>, kind: ShotKind, tick: u16) {
        let team = self.players[shooter].team_index;
        let ltr = self.ltr(team);
        let sm = model::shot_model(&self.players[shooter], keeper.map(|k| &self.players[k]), &self.players, ltr, kind);
        let penalty = kind == ShotKind::Penalty;
        if kind == ShotKind::Header {
            self.diag.headers += 1;
        }

        self.player_stats[shooter].shots += 1;
        if kind == ShotKind::OpenPlay {
            let d = model::dist_m(self.players[shooter].pos, model::goal_of(ltr));
            let band = [8.0, 12.0, 16.5, 25.0].iter().filter(|&&b| d >= b).count();
            self.diag.shot_distance[band] += 1;
        }
        let stats = self.team_stats(team);
        stats.shots += 1;
        stats.xg += sm.xg;

        let roll: f32 = self.rng.r#gen();
        if roll < sm.p_goal {
            self.team_stats(team).shots_on_target += 1;
            self.team_stats(team).score += 1;
            let assister = match self.last_pass {
                Some((p, r)) if r == shooter && !penalty => Some(p),
                _ => None,
            };
            self.player_stats[shooter].goals += 1;
            self.player_stats[shooter].points += points::GOAL;
            if let Some(k) = keeper {
                self.player_stats[k].points -= points::GOAL / 2.0;
            }
            if let Some(a) = assister {
                self.player_stats[a].assists += 1;
                self.player_stats[a].points += points::ASSIST;
            }
            self.record(tick, EventKind::Goal { penalty }, Some(shooter), assister, Some(sm.xg));
            self.kick_off(1 - team);
            return;
        }

        let on_target = roll < sm.p_goal + (1.0 - sm.p_goal) * sm.p_on_target_if_no_goal;
        match keeper {
            Some(k) if on_target => {
                self.team_stats(team).shots_on_target += 1;
                self.player_stats[k].saves += 1;
                self.player_stats[k].points += points::SAVE;
                self.record(tick, EventKind::Save { penalty }, Some(k), Some(shooter), Some(sm.xg));
                self.give_ball_to(k);
            }
            _ => {
                // Off target - or charged down by a defender in the way.
                let blocked = sm.blockers > 0 && !penalty && self.rng.gen_bool(0.5);
                let blocker = blocked.then(|| self.nearest_of(1 - team, self.players[shooter].pos));
                self.player_stats[shooter].points -= points::GOAL / 2.0;
                self.record(tick, EventKind::Miss { penalty, blocked }, Some(shooter), blocker, Some(sm.xg));
                let restart = blocker.or(keeper).unwrap_or_else(|| self.nearest_of(1 - team, self.ball.pos));
                self.give_ball_to(restart);
            }
        }
    }

    /// `team` takes a penalty: its best penalty taker, from the spot.
    fn execute_penalty(&mut self, team: usize, tick: u16) {
        self.diag.penalties += 1;
        let ltr = self.ltr(team);
        let taker = (team * 11..team * 11 + 11)
            .filter(|&i| self.active(i) && self.players[i].position != PositionCategory::GK)
            .max_by(|&a, &b| {
                let t = |i: usize| {
                    let at = &self.players[i].attributes;
                    at.set_piece * 0.4 + at.shooting * 0.3 + at.mental * 0.3
                };
                t(a).total_cmp(&t(b))
            })
            .unwrap_or(team * 11);
        let spot_fwd = (PITCH_LENGTH_METERS - 11.0) / PITCH_LENGTH_METERS;
        let spot = Vec2::new(if ltr { spot_fwd } else { 1.0 - spot_fwd }, 0.5);
        self.players[taker].pos = spot;
        self.ball.pos = spot;
        self.last_pass = None;
        let keeper = self.keeper_of(1 - team);
        self.shoot(taker, keeper, ShotKind::Penalty, tick);
    }

    /// A cleared ball: the nearest player gets to it.
    fn collect_loose_ball(&mut self) {
        let ball = self.ball.pos;
        let nearest = (0..22)
            .filter(|&i| self.active(i))
            .min_by(|&a, &b| model::dist_m(self.players[a].pos, ball).total_cmp(&model::dist_m(self.players[b].pos, ball)))
            .unwrap_or(0);
        self.players[nearest].pos = ball;
        self.give_ball_to(nearest);
    }

    fn capture_frame(&mut self, tick: u16, minute: u8) {
        let q = |v: f32, max: f32| ((v * max).clamp(0.0, max) * REPLAY_SCALE).round() as i16;
        let frame = self.replay.tick.len() as u32;
        let r = &mut self.replay;
        r.tick.push(tick);
        r.minute.push(minute);
        r.half.push(if tick < HALF_TIME_TICK { 1 } else { 2 });
        r.ball.push(q(self.ball.pos.x, 32.0));
        r.ball.push(q(self.ball.pos.y, 20.0));
        for p in &self.players {
            r.xy.push(q(p.pos.x, 32.0));
            r.xy.push(q(p.pos.y, 20.0));
        }
        r.holder.push(self.ball.holder_idx.map_or(-1, |h| h as i8));

        // Status/cards: only when they change.
        for (slot, p) in self.players.iter().enumerate() {
            let now = (p.is_sent_off, self.player_stats[slot].yellow_cards, self.player_stats[slot].red_cards);
            if now != self.last_status[slot] {
                let status = if p.is_sent_off { "sent-off" } else { "active" };
                r.status.push((frame, slot as u8, status.to_string(), now.1, now.2));
                self.last_status[slot] = now;
            }
        }
    }
}
