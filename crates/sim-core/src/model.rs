// crates/sim-core/src/model.rs
//
// The match model: how likely an action is to succeed, and what having the
// ball somewhere is worth. Pure functions of the match state - no RNG.
//
// The Decider judges options with these SAME functions the engine then
// resolves them with, so a player's choice and its outcome can never
// disagree about how risky something is. Every probability is a log-odds
// sum (situation + skill gaps, see config.rs), so how much quality matters
// is one measurable dial.

use crate::config::CFG;
use crate::geom::{Vec2, PITCH_LENGTH_METERS as LEN, PITCH_WIDTH_METERS as WID};
use crate::types::{Attributes, PositionCategory, SimPlayer};

const GOAL_WIDTH_M: f32 = 7.32;
const BOX_DEPTH_M: f32 = 16.5;
const BOX_HALF_WIDTH_M: f32 = 20.16;

pub fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

pub fn logit(p: f32) -> f32 {
    let q = p.clamp(0.001, 0.999);
    (q / (1.0 - q)).ln()
}

// ---------------------------------------------------------------------
// Geometry in metres. Positions are normalized (x along the 105m length,
// y across the 68m width); `ltr` = attacking towards x = 1.
// ---------------------------------------------------------------------

#[inline]
pub fn to_m(p: Vec2) -> Vec2 {
    Vec2::new(p.x * LEN, p.y * WID)
}

#[inline]
pub fn from_m(m: Vec2) -> Vec2 {
    Vec2::new(m.x / LEN, m.y / WID)
}

#[inline]
pub fn dist_m(a: Vec2, b: Vec2) -> f32 {
    to_m(a).distance(to_m(b))
}

/// Distance (m) from `p` to the segment a-b.
#[inline]
pub fn seg_dist_m(p: Vec2, a: Vec2, b: Vec2) -> f32 {
    to_m(p).distance_to_segment(to_m(a), to_m(b))
}

#[inline]
pub fn goal_of(ltr: bool) -> Vec2 {
    Vec2::new(if ltr { 1.0 } else { 0.0 }, 0.5)
}

/// Metres advanced towards the attacked goal line (0 = own goal line).
#[inline]
pub fn fwd_m(p: Vec2, ltr: bool) -> f32 {
    if ltr { p.x * LEN } else { (1.0 - p.x) * LEN }
}

/// The point `step_m` metres from `from` towards `to` (or `to` itself if
/// it is closer), kept on the pitch.
pub fn towards(from: Vec2, to: Vec2, step_m: f32) -> Vec2 {
    let (a, b) = (to_m(from), to_m(to));
    let gap = a.distance(b);
    if gap <= step_m || gap < 1e-4 {
        return to;
    }
    let k = step_m / gap;
    from_m(Vec2::new(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)).clamp_pitch()
}

/// Inside the penalty area of the goal being attacked.
pub fn in_attacking_box(p: Vec2, ltr: bool) -> bool {
    LEN - fwd_m(p, ltr) <= BOX_DEPTH_M && ((p.y - 0.5) * WID).abs() <= BOX_HALF_WIDTH_M
}

/// Opponents of `team` within `radius_m` of `p`.
pub fn pressure_at(p: Vec2, players: &[SimPlayer], team: usize, radius_m: f32) -> usize {
    players
        .iter()
        .filter(|d| d.team_index != team && !d.is_sent_off && dist_m(p, d.pos) <= radius_m)
        .count()
}

/// Forward coordinate (m) of the defending side's last outfield player -
/// the offside line, from the attackers' point of view.
pub fn offside_line_m(players: &[SimPlayer], attacking_team: usize, ltr: bool) -> f32 {
    players
        .iter()
        .filter(|d| d.team_index != attacking_team && !d.is_sent_off && d.position != PositionCategory::GK)
        .map(|d| fwd_m(d.pos, ltr))
        .fold(LEN / 2.0, f32::max)
}

// ---------------------------------------------------------------------
// Skills: weighted attributes x fatigue x boost (home advantage).
// ---------------------------------------------------------------------

pub fn fatigue_multiplier(p: &SimPlayer) -> f32 {
    1.0 - (1.0 - p.stamina / 100.0).clamp(0.0, 1.0) * CFG.fatigue_impact
}

fn effective(p: &SimPlayer, raw: f32) -> f32 {
    raw * fatigue_multiplier(p) * p.boost
}

pub fn decision_quality(a: &Attributes) -> f32 {
    (a.mental + a.vision) / 2.0
}

fn finishing(a: &Attributes, distance_m: f32) -> f32 {
    let far = ((distance_m - 12.0) / 14.0).clamp(0.0, 1.0);
    let near = a.shooting * 0.6 + a.mental * 0.2 + a.positioning * 0.15 + a.shot_power * 0.05;
    let long = a.long_shot * 0.55 + a.shot_power * 0.25 + a.mental * 0.15 + a.positioning * 0.05;
    near * (1.0 - far) + long * far
}

fn heading(a: &Attributes) -> f32 {
    a.strength * 0.35 + a.positioning * 0.35 + a.shooting * 0.2 + a.agility * 0.1
}

/// Striking a moving ball first time: shooting plus control and agility.
fn volleying(a: &Attributes) -> f32 {
    a.shooting * 0.45 + a.control * 0.25 + a.agility * 0.15 + a.mental * 0.15
}

/// Winning a ball in the air: getting there, and out-muscling your man.
fn aerial(a: &Attributes) -> f32 {
    a.strength * 0.4 + a.positioning * 0.4 + a.agility * 0.2
}

fn aerial_defending(a: &Attributes) -> f32 {
    a.marking * 0.4 + a.strength * 0.4 + a.positioning * 0.2
}

fn goalkeeping(a: &Attributes) -> f32 {
    a.keeping * 0.55 + a.positioning * 0.2 + a.agility * 0.15 + a.mental * 0.1
}

fn penalty_taking(a: &Attributes) -> f32 {
    a.set_piece * 0.4 + a.shooting * 0.3 + a.mental * 0.3
}

// ---------------------------------------------------------------------
// Possession value
// ---------------------------------------------------------------------

/// Probability that a possession at `p` (attacking per `ltr`) ends in a
/// goal - low in your own half, rising steeply near the opposition box
/// and towards the centre. The common currency of every decision.
pub fn possession_value(p: Vec2, ltr: bool) -> f32 {
    let d = dist_m(p, goal_of(ltr));
    let lateral = ((p.y - 0.5) * WID).abs();
    CFG.value_base + CFG.value_peak * (-d / CFG.value_decay_m).exp() * (-(lateral / CFG.value_lateral_m).powi(2)).exp()
}

/// What losing the ball at `p` costs: the opponent's possession value there.
pub fn turnover_cost(p: Vec2, ltr: bool) -> f32 {
    possession_value(p, !ltr)
}

// ---------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShotKind {
    OpenPlay,
    /// First-time header from a cross.
    Header,
    /// First-time strike without settling the ball (First-Time Volley).
    Volley,
    Penalty,
}

#[derive(Debug, Clone, Copy)]
pub struct ShotModel {
    /// Chance quality from the situation alone (league-average shooter vs
    /// league-average keeper) - what match stats report as xG.
    pub xg: f32,
    /// This shooter vs this keeper.
    pub p_goal: f32,
    pub p_on_target_if_no_goal: f32,
    pub blockers: usize,
}

pub fn shot_model(shooter: &SimPlayer, keeper: Option<&SimPlayer>, players: &[SimPlayer], ltr: bool, kind: ShotKind) -> ShotModel {
    shot_model_impl(shooter, keeper, players, ltr, kind, true)
}

/// The shot model **without** resolved ability bonuses. This is the currency
/// the decider values a shot with: the decider's softmax temperature is in
/// possession-value units (~0.01), so feeding a p_goal-level bonus into the
/// shoot/hold EV would swamp every other option and make an equipped side
/// shoot far too often. Innate finishing quality therefore changes the
/// *outcome* (which `shot_model` resolves), not the *choice*.
pub fn shot_model_plain(shooter: &SimPlayer, keeper: Option<&SimPlayer>, players: &[SimPlayer], ltr: bool, kind: ShotKind) -> ShotModel {
    shot_model_impl(shooter, keeper, players, ltr, kind, false)
}

fn shot_model_impl(shooter: &SimPlayer, keeper: Option<&SimPlayer>, players: &[SimPlayer], ltr: bool, kind: ShotKind, use_effects: bool) -> ShotModel {
    let goal = goal_of(ltr);
    let depth = (LEN - fwd_m(shooter.pos, ltr)).max(1.0);
    let lateral = ((shooter.pos.y - 0.5) * WID).abs();
    let distance = depth.hypot(lateral);
    let half = GOAL_WIDTH_M / 2.0;
    let mut angle = (GOAL_WIDTH_M * depth).atan2(depth * depth + lateral * lateral - half * half);
    if angle < 0.0 {
        angle += std::f32::consts::PI;
    }

    let team = shooter.team_index;
    let shooter_fwd = fwd_m(shooter.pos, ltr);
    let defenders = || players.iter().filter(|d| d.team_index != team && !d.is_sent_off && d.position != PositionCategory::GK);
    let blockers = defenders()
        .filter(|d| fwd_m(d.pos, ltr) > shooter_fwd && seg_dist_m(d.pos, shooter.pos, goal) <= 1.2)
        .count();
    let pressure = pressure_at(shooter.pos, players, team, CFG.pressure_m).min(2);
    let crowd = defenders().filter(|d| dist_m(d.pos, shooter.pos) <= CFG.crowd_m).count().min(4);
    let clear_through = defenders().all(|d| fwd_m(d.pos, ltr) <= shooter_fwd);

    let (situation, shooter_skill) = match kind {
        ShotKind::Penalty => (logit(CFG.penalty_xg), penalty_taking(&shooter.attributes)),
        ShotKind::OpenPlay | ShotKind::Header | ShotKind::Volley => (
            match kind {
                ShotKind::Header => CFG.header_logit,
                ShotKind::Volley => CFG.volley_logit,
                _ => 0.0,
            }
                + CFG.shot_intercept
                + CFG.shot_angle * angle
                + CFG.shot_distance * distance
                + CFG.shot_blocker * blockers as f32
                + CFG.shot_pressure * pressure as f32
                + CFG.shot_crowd * crowd as f32
                + if clear_through { CFG.shot_one_on_one } else { 0.0 }
                // Resolved ability modifiers (zero when the player has none,
                // or when the caller wants the effect-free valuation).
                // A ShotQuality bonus is for shots with the feet; headers are
                // governed by HeaderQuality.
                + if use_effects {
                    if kind == ShotKind::Header {
                        shooter.effects.header_bonus * CFG.header_bonus_scale
                    } else {
                        shooter.effects.shot_bonus * CFG.shot_bonus_scale
                    }
                } else {
                    0.0
                }
                + if use_effects && kind == ShotKind::Volley && shooter.effects.shot_first_time { CFG.first_time_bonus } else { 0.0 },
            match kind {
                ShotKind::Header => heading(&shooter.attributes),
                ShotKind::Volley => volleying(&shooter.attributes),
                _ => finishing(&shooter.attributes, distance),
            },
        ),
    };
    let shooter_skill = effective(shooter, shooter_skill);
    // An outfielder in goal (keeper sent off, no replacement) is hopeless.
    let keeper_skill = keeper.map_or(20.0, |k| effective(k, goalkeeping(&k.attributes)));

    let p_goal = sigmoid(
        situation + (shooter_skill - CFG.skill_pivot) / CFG.shooter_scale - (keeper_skill - CFG.skill_pivot) / CFG.keeper_scale,
    )
    .min(CFG.max_goal_probability);

    let accuracy = effective(shooter, shooter.attributes.shooting * 0.7 + shooter.attributes.mental * 0.3);
    let p_on_target_if_no_goal = (CFG.on_target_base + (accuracy - CFG.skill_pivot) / CFG.on_target_skill_scale
        - CFG.on_target_pressure * pressure as f32
        - CFG.on_target_per_m * (distance - 11.0).max(0.0))
    .clamp(0.05, 0.8);

    ShotModel { xg: sigmoid(situation), p_goal, p_on_target_if_no_goal, blockers }
}

// ---------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PassKind {
    Short,
    Backward,
    Wide,
    Long,
    /// Into space behind the defence, for the receiver to run onto.
    Through,
    /// From a wide position into the box, to be won in the air.
    Cross,
    /// A long cross-field switch (the Trivela ability's long pass).
    Switch,
}

impl PassKind {
    fn base(self) -> f32 {
        CFG.pass_base[self as usize]
    }

    /// From geometry; `Through` is only ever chosen explicitly.
    pub fn classify(from: Vec2, to: Vec2, ltr: bool) -> Self {
        let progress = fwd_m(to, ltr) - fwd_m(from, ltr);
        let distance = dist_m(from, to);
        let lateral = ((to.y - from.y) * WID).abs();
        let from_wide = ((from.y - 0.5) * WID).abs() >= CFG.cross_wide_m;
        if from_wide && fwd_m(from, ltr) >= CFG.cross_from_fwd_m && in_attacking_box(to, ltr) {
            PassKind::Cross
        } else if progress < -5.0 {
            PassKind::Backward
        } else if lateral > 20.0 && progress < 12.0 {
            PassKind::Wide
        } else if distance >= 30.0 {
            PassKind::Long
        } else {
            PassKind::Short
        }
    }
}

fn passing(a: &Attributes, kind: PassKind) -> f32 {
    match kind {
        PassKind::Short => a.short_pass * 0.55 + a.vision * 0.15 + a.mental * 0.15 + a.control * 0.15,
        PassKind::Backward => a.short_pass * 0.6 + a.mental * 0.2 + a.control * 0.2,
        PassKind::Wide => a.crossing * 0.4 + a.long_pass * 0.3 + a.vision * 0.2 + a.mental * 0.1,
        PassKind::Long => a.long_pass * 0.55 + a.vision * 0.25 + a.mental * 0.2,
        PassKind::Through => a.vision * 0.45 + a.long_pass * 0.35 + a.mental * 0.2,
        PassKind::Cross => a.crossing * 0.6 + a.vision * 0.2 + a.long_pass * 0.2,
        PassKind::Switch => a.long_pass * 0.4 + a.crossing * 0.25 + a.vision * 0.2 + a.control * 0.15,
    }
}

fn first_touch(a: &Attributes) -> f32 {
    a.control * 0.7 + a.agility * 0.15 + a.strength * 0.15
}

fn reading_the_game(a: &Attributes) -> f32 {
    a.interception * 0.45 + a.positioning * 0.3 + a.mental * 0.15 + a.speed * 0.1
}

#[derive(Debug, Clone, Copy)]
pub struct PassModel {
    pub p_complete: f32,
    /// The defender best placed to cut it out - who wins a failed pass.
    pub interceptor: Option<usize>,
}

/// `tempo` is the passing side's instruction (0-1): rushed passes go astray
/// more often, patient ones less.
pub fn pass_model(passer: &SimPlayer, receiver: &SimPlayer, target: Vec2, kind: PassKind, players: &[SimPlayer], tempo: f32) -> PassModel {
    let team = passer.team_index;
    let distance = dist_m(passer.pos, target);

    let mut interceptor = None;
    let mut closest = f32::MAX;
    let mut blockers = 0;
    for (i, d) in players.iter().enumerate() {
        // A cross goes over the lane; it's contested at the far end instead.
        if kind == PassKind::Cross || d.team_index == team || d.is_sent_off || d.position == PositionCategory::GK {
            continue;
        }
        let off = seg_dist_m(d.pos, passer.pos, target);
        // A lane-reading defender (Interception ability) contests a wider lane.
        let lane = CFG.lane_m + if d.effects.interception_lane { CFG.interception_lane_extra_m } else { 0.0 };
        if off <= lane {
            blockers += 1;
            if off < closest {
                closest = off;
                interceptor = Some(i);
            }
        }
    }

    let mut l = logit(kind.base())
        + CFG.tempo_pass_logit * (tempo - 0.5)
        + CFG.pass_per_m * (distance - CFG.pass_comfortable_m).max(0.0)
        + CFG.pass_passer_pressure
            * if matches!(kind, PassKind::Long | PassKind::Through | PassKind::Switch) { CFG.lofted_pressure_factor } else { 1.0 }
            * pressure_at(passer.pos, players, team, CFG.pressure_m).min(3) as f32
        + CFG.pass_receiver_pressure * pressure_at(target, players, team, CFG.pressure_m + 0.5).min(3) as f32
        + CFG.pass_blocker * blockers.min(2) as f32
        + (effective(passer, passing(&passer.attributes, kind)) - CFG.skill_pivot) / CFG.passer_scale
        + if kind == PassKind::Cross { 0.0 } else { (effective(receiver, first_touch(&receiver.attributes)) - CFG.skill_pivot) / (2.0 * CFG.passer_scale) }
        // Resolved ability modifiers (zero when the player has none).
        + if kind == PassKind::Cross { passer.effects.cross_inswing * CFG.cross_inswing_bonus } else { 0.0 }
        + if kind == PassKind::Switch && passer.effects.has(crate::types::action::TRIVELA) { CFG.trivela_bonus } else { 0.0 };

    if kind == PassKind::Cross {
        // Won in the air against the nearest defender to where it lands.
        let marker = players
            .iter()
            .enumerate()
            .filter(|(_, d)| d.team_index != team && !d.is_sent_off && d.position != PositionCategory::GK)
            .min_by(|a, b| dist_m(a.1.pos, target).total_cmp(&dist_m(b.1.pos, target)));
        if let Some((i, m)) = marker {
            l += (effective(receiver, aerial(&receiver.attributes)) - effective(m, aerial_defending(&m.attributes))) / CFG.aerial_scale;
            interceptor = Some(i);
        }
    }

    if let Some(i) = interceptor {
        l -= (effective(&players[i], reading_the_game(&players[i].attributes)) - CFG.skill_pivot) / CFG.interceptor_scale
            + players[i].effects.interception_bonus * CFG.interception_bonus_scale;
    }

    if kind == PassKind::Through {
        // The race for the ball: receiver vs the quickest defender near it.
        let chaser = players
            .iter()
            .filter(|d| d.team_index != team && !d.is_sent_off && d.position != PositionCategory::GK)
            .min_by(|a, b| dist_m(a.pos, target).total_cmp(&dist_m(b.pos, target)));
        if let Some(c) = chaser {
            l += (effective(receiver, receiver.attributes.speed) - effective(c, c.attributes.speed)) / CFG.race_scale;
        }
    }

    PassModel { p_complete: sigmoid(l), interceptor }
}

/// Where a through ball to `receiver` is played: into the space behind
/// the defensive line (`line_m`), up to the edge of the box - the keeper
/// comes for anything closer. None when he's too far from the line to run
/// onto it, or there's no space behind it (a deep block).
pub fn through_target(receiver: &SimPlayer, line_m: f32, ltr: bool) -> Option<Vec2> {
    let fwd = fwd_m(receiver.pos, ltr);
    if line_m - fwd > CFG.through_reach_m {
        return None;
    }
    let target_fwd = (line_m + CFG.through_run_m).min(LEN - 14.0);
    if target_fwd - line_m < 4.0 {
        return None;
    }
    // Run towards goal: drift a little towards the centre.
    let y = receiver.pos.y + (0.5 - receiver.pos.y) * 0.25;
    let x = if ltr { target_fwd / LEN } else { 1.0 - target_fwd / LEN };
    Some(Vec2::new(x, y))
}

/// Like `through_target`, but the Through-Ball-in-Behind ability plays the
/// ball further into the space behind a HIGH line (a longer run into more
/// grass). None when there isn't enough room to be worth it.
pub fn through_in_behind_target(receiver: &SimPlayer, line_m: f32, ltr: bool) -> Option<Vec2> {
    let fwd = fwd_m(receiver.pos, ltr);
    if line_m - fwd > CFG.through_reach_m {
        return None;
    }
    let target_fwd = (line_m + CFG.through_run_m * 2.0).min(LEN - 12.0);
    if target_fwd - line_m < 6.0 {
        return None;
    }
    let y = receiver.pos.y + (0.5 - receiver.pos.y) * 0.15;
    let x = if ltr { target_fwd / LEN } else { 1.0 - target_fwd / LEN };
    Some(Vec2::new(x, y))
}

// ---------------------------------------------------------------------
// Gated abilities: pure, RNG-free action probabilities (07 §6). Each of
// these is the SAME function the engine resolves the action with, so the
// decider's EV and the outcome can never disagree.
// ---------------------------------------------------------------------

/// Situation xG of a first-time volley - `shot_model` with `ShotKind::Volley`.
pub fn volley_xg(shooter: &SimPlayer, keeper: Option<&SimPlayer>, players: &[SimPlayer], ltr: bool) -> f32 {
    shot_model(shooter, keeper, players, ltr, ShotKind::Volley).xg
}

/// Completion of a long cross-field trivela switch - `pass_model` with
/// `PassKind::Switch` (which carries the trivela bonus when unlocked).
pub fn trivela_switch_probability(passer: &SimPlayer, receiver: &SimPlayer, target: Vec2, players: &[SimPlayer]) -> f32 {
    pass_model(passer, receiver, target, PassKind::Switch, players, 0.5).p_complete
}

/// P(the keeper reaches and claims a ball at `ball`), by handling, speed and
/// how close it is to his own goal. Zero beyond the sweeping range.
pub fn sweeper_claim_probability(keeper: &SimPlayer, ball: Vec2, ltr: bool) -> f32 {
    let own_goal = goal_of(!ltr);
    let d = dist_m(ball, own_goal);
    if d > CFG.sweeper_claim_range_m {
        return 0.0;
    }
    let near = 1.0 - (d / CFG.sweeper_claim_range_m).clamp(0.0, 1.0);
    let handling = effective(keeper, goalkeeping(&keeper.attributes));
    let rush = effective(keeper, keeper.attributes.speed * 0.6 + keeper.attributes.agility * 0.4);
    sigmoid(
        logit(CFG.sweeper_claim_base)
            + (handling - CFG.skill_pivot) / CFG.sweeper_claim_scale
            + (rush - CFG.skill_pivot) / (2.0 * CFG.sweeper_claim_scale)
            + CFG.sweeper_claim_near * near,
    )
    .clamp(0.0, 0.95)
}

/// The value (in possession-value terms) of conceding a foul to stop the
/// carrier's transition: what the attack threatens, less the card risk.
pub fn tactical_foul_value(defender: &SimPlayer, carrier: &SimPlayer, ltr: bool, score_diff: i32, minute: f32) -> f32 {
    let threat = possession_value(carrier.pos, ltr);
    let timing = if minute >= 75.0 { 1.25 } else { 1.0 };
    let chasing = if score_diff < 0 { 1.15 } else { 1.0 };
    let discipline = (defender.attributes.aggression - 50.0) / 500.0;
    let booked = if defender.cards == crate::types::CardState::Yellow { 1.0 } else { 0.0 };
    threat * CFG.tactical_foul_danger * timing * chasing + discipline - CFG.tactical_foul_card * booked
}

// ---------------------------------------------------------------------
// Duels
// ---------------------------------------------------------------------

fn tackling(a: &Attributes) -> f32 {
    a.tackling * 0.45 + a.marking * 0.2 + a.strength * 0.15 + a.positioning * 0.1 + a.aggression * 0.1
}

fn shielding(a: &Attributes) -> f32 {
    a.dribbling * 0.3 + a.control * 0.3 + a.strength * 0.2 + a.agility * 0.2
}

fn dribbling(a: &Attributes) -> f32 {
    a.dribbling * 0.45 + a.agility * 0.25 + a.speed * 0.15 + a.control * 0.15
}

fn containing(a: &Attributes) -> f32 {
    a.tackling * 0.35 + a.marking * 0.3 + a.speed * 0.2 + a.positioning * 0.15
}

/// P(the tackler wins the ball from the holder).
pub fn tackle_probability(tackler: &SimPlayer, holder: &SimPlayer) -> f32 {
    sigmoid(
        logit(CFG.tackle_base)
            + (effective(tackler, tackling(&tackler.attributes)) - effective(holder, shielding(&holder.attributes))) / CFG.duel_scale,
    )
}

/// P(the dribbler beats the defender) - harder with team-mates covering
/// him: beating one man in a crowd rarely gets you anywhere.
pub fn dribble_probability(dribbler: &SimPlayer, defender: &SimPlayer, players: &[SimPlayer]) -> f32 {
    let cover = pressure_at(dribbler.pos, players, dribbler.team_index, CFG.cover_m).saturating_sub(1);
    sigmoid(
        logit(CFG.dribble_base)
            + (effective(dribbler, dribbling(&dribbler.attributes)) - effective(defender, containing(&defender.attributes))) / CFG.duel_scale
            + CFG.dribble_cover * cover as f32,
    )
}

/// P(a challenge is a foul) - aggressive, poor tacklers foul more, a
/// beaten defender's late lunge most of all; booked players and defenders
/// in their own box less.
pub fn foul_probability(tackler: &SimPlayer, won_ball: bool, in_own_box: bool) -> f32 {
    let a = &tackler.attributes;
    let mut p = (CFG.foul_base + (a.aggression - a.tackling) / CFG.foul_aggr_scale + if won_ball { 0.0 } else { CFG.foul_lost_extra })
        .clamp(0.02, 0.6);
    // A booked player tackles more carefully - and so does anyone in his
    // own box, where a foul is a penalty.
    if tackler.cards == crate::types::CardState::Yellow {
        p *= 0.5;
    }
    if in_own_box {
        p *= CFG.box_foul_caution;
    }
    p
}

/// P(the defender commits to a challenge rather than jockeying).
pub fn engage_probability(defender: &SimPlayer, pressing_intensity: f32) -> f32 {
    (CFG.engage_base + (defender.attributes.aggression - 50.0) / CFG.engage_aggr_scale + (pressing_intensity - 0.5) * CFG.engage_press)
        .clamp(0.05, 0.95)
}
