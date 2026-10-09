// crates/sim-core/src/config.rs
//
// Every tunable constant of the match model, in one place. Calibrated with
// `cargo run --release --bin sim-lab` (realism + agency); change a value,
// rebuild, re-measure.
//
// Probabilities are modelled in log-odds: a situation sets a base, and each
// skill gap shifts it by (skill - SKILL_PIVOT) / scale. A larger `*_scale`
// means individual quality matters LESS per action - the main dial between
// "the better squad always wins" and "anything can happen".

pub struct SimConfig {
    // --- Movement (per 7.5-second tick) -------------------------------
    /// Distance a player covers per tick: base + speed/100 * per_speed.
    pub step_base_m: f32,
    pub step_per_speed_m: f32,
    /// Pressers per defending side: base + pressing_intensity * per_intensity.
    pub pressers_base: f32,
    pub pressers_per_intensity: f32,
    /// A side presses only while the ball is within this far of its own
    /// goal: (base + pressing_intensity * per_intensity) x pitch length - a
    /// low block waits in its own half, a high press hunts everywhere.
    /// Outside the zone a single player shadows the ball.
    pub press_zone_base: f32,
    pub press_zone_per_intensity: f32,
    /// Attackers in possession hold this far onside of the last defender.
    pub onside_margin_m: f32,
    /// In their own half, defenders mark attackers within this distance of
    /// goal, standing this far goal-side of them.
    pub mark_zone_m: f32,
    pub mark_distance_m: f32,

    // --- Duels -----------------------------------------------------------
    /// A defender this close to the carrier can challenge.
    pub contact_m: f32,
    /// P(defender commits to a challenge) = base + (Aggression-50)/aggr_scale
    /// + (pressing_intensity-0.5) * press.
    pub engage_base: f32,
    pub engage_aggr_scale: f32,
    pub engage_press: f32,
    pub tackle_base: f32,
    pub dribble_base: f32,
    pub duel_scale: f32,
    /// Log-odds a take-on loses per covering defender (other opponents
    /// within `cover_m` of the dribbler).
    pub dribble_cover: f32,
    pub cover_m: f32,
    /// Defenders inside their own penalty area foul this much less often.
    pub box_foul_caution: f32,
    /// P(foul | challenge) = base + (Aggression-Tackling)/aggr_scale, plus
    /// `lost_extra` when the tackler is beaten (the late lunge).
    pub foul_base: f32,
    pub foul_aggr_scale: f32,
    pub foul_lost_extra: f32,
    pub yellow_share: f32,
    pub red_share: f32,

    // --- Shots -------------------------------------------------------------
    /// Open-play xG log-odds = intercept + angle*rad + distance*metres.
    pub shot_intercept: f32,
    pub shot_angle: f32,
    pub shot_distance: f32,
    pub shot_blocker: f32,
    pub shot_pressure: f32,
    pub shot_one_on_one: f32,
    pub penalty_xg: f32,
    pub skill_pivot: f32,
    pub shooter_scale: f32,
    pub keeper_scale: f32,
    pub max_goal_probability: f32,
    pub on_target_base: f32,
    pub on_target_skill_scale: f32,
    pub on_target_pressure: f32,
    pub on_target_per_m: f32,
    pub max_shot_m: f32,

    // --- Passes ------------------------------------------------------------
    /// Base completion: short, backward, wide, long, through, cross.
    pub pass_base: [f32; 6],
    /// A cross: from at least this far wide, this far up the pitch, into
    /// the box. Won in the air: receiver vs marker, `aerial_scale` points
    /// per log-odds; the header that follows is `header_logit` harder to
    /// score than a shot with the feet from the same spot.
    pub cross_wide_m: f32,
    pub cross_from_fwd_m: f32,
    pub aerial_scale: f32,
    pub header_logit: f32,
    pub pass_comfortable_m: f32,
    pub pass_per_m: f32,
    pub pass_passer_pressure: f32,
    pub pass_receiver_pressure: f32,
    pub pass_blocker: f32,
    pub passer_scale: f32,
    pub interceptor_scale: f32,
    /// Through ball: receiver Speed vs the chasing defender's.
    pub race_scale: f32,
    pub lane_m: f32,
    pub pressure_m: f32,
    pub max_pass_m: f32,
    /// How far beyond the defensive line a through ball is played into
    /// space (stopping at the edge of the box) - a high line leaves room,
    /// a deep one doesn't.
    pub through_run_m: f32,
    /// The receiver must be this close to the line to run onto it.
    pub through_reach_m: f32,

    // --- Possession value (xT-like: P(this possession scores)) ---------------
    pub value_base: f32,
    pub value_peak: f32,
    pub value_decay_m: f32,
    pub value_lateral_m: f32,

    // --- Decisions -----------------------------------------------------------
    /// Softmax temperature over expected values; a player with Mental/Vision
    /// at quality_ceiling chooses at temp_min (nearly always the best option).
    pub temp_max: f32,
    pub temp_min: f32,
    pub quality_floor: f32,
    pub quality_ceiling: f32,
    /// Team-instruction bias unit, in possession-value terms.
    pub style_unit: f32,
    pub style_tempo: f32,
    pub style_directness: f32,
    pub style_width: f32,
    /// High tempo/directness accept more risk: turnover cost is weighted by
    /// 1 - risk_style * (tempo + directness - 1) / 2.
    pub risk_style: f32,
    /// What tempo costs, per unit of (tempo - 0.5): rushed passes lose
    /// completion log-odds, rushed decisions get a hotter softmax, and the
    /// side runs more. Patient play gains the reverse.
    pub tempo_pass_logit: f32,
    pub tempo_temperature: f32,
    pub tempo_drain: f32,
    pub carry_step_m: f32,
    pub take_on_step_m: f32,
    pub carry_loss_base: f32,
    pub carry_loss_pressure: f32,
    pub hold_loss_base: f32,
    pub hold_loss_pressure: f32,
    /// Holding the ball keeps it but stalls the attack: its value is
    /// discounted by this factor.
    pub hold_value_factor: f32,

    // --- Fatigue ---------------------------------------------------------------
    pub drain_base: f32,
    pub drain_per_m: f32,
    /// Stamina 100 cuts drain by this fraction.
    pub stamina_mitigation: f32,
    /// Execution penalty at 0 stamina (skills x (1 - impact)).
    pub fatigue_impact: f32,
    pub halftime_recovery: f32,
    /// Extra stamina a presser burns per tick, on top of distance: a high
    /// press wins the ball early and pays for it late.
    pub press_drain: f32,
    /// A long ball or through ball goes over the press: the passer-pressure
    /// penalty is scaled by this for those passes.
    pub lofted_pressure_factor: f32,
    /// Shots into a crowd: log-odds per defender (max 4) within `crowd_m`
    /// of the shooter - a compact low block protects its box.
    pub shot_crowd: f32,
    pub crowd_m: f32,
    /// Skill edge for the side whose style counters the other's
    /// (tactics::style_matchup); the countered side loses the same.
    pub counter_edge: f32,
    /// Skill edge for the side whose formation counters the other's
    /// (tactics::formation_matchup); the countered side loses the same.
    pub formation_edge: f32,
    /// Share of a player's missing fitness (0-100, between matches) that
    /// carries into his starting stamina.
    pub fitness_carry: f32,

    // --- Home advantage --------------------------------------------------------
    /// Home players' skills x (1 + this).
    pub home_advantage: f32,
}

pub const CFG: SimConfig = SimConfig {
    step_base_m: 3.0,
    step_per_speed_m: 3.0,
    pressers_base: 1.0,
    pressers_per_intensity: 2.5,
    press_zone_base: 0.35,
    press_zone_per_intensity: 0.6,
    onside_margin_m: 1.0,
    mark_zone_m: 32.0,
    mark_distance_m: 1.5,

    contact_m: 2.0,
    engage_base: 0.09,
    engage_aggr_scale: 300.0,
    engage_press: 0.15,
    tackle_base: 0.5,
    dribble_base: 0.42,
    duel_scale: 30.0,
    dribble_cover: -0.4,
    cover_m: 5.0,
    box_foul_caution: 0.65,
    foul_base: 0.26,
    foul_aggr_scale: 250.0,
    foul_lost_extra: 0.10,
    yellow_share: 0.15,
    red_share: 0.002,

    shot_intercept: -0.45,
    shot_angle: 1.0,
    shot_distance: -0.132,
    shot_blocker: -0.6,
    shot_pressure: -0.35,
    shot_one_on_one: 0.5,
    penalty_xg: 0.76,
    skill_pivot: 65.0,
    shooter_scale: 45.0,
    keeper_scale: 45.0,
    max_goal_probability: 0.33,
    on_target_base: 0.3,
    on_target_skill_scale: 200.0,
    on_target_pressure: 0.05,
    on_target_per_m: 0.004,
    max_shot_m: 35.0,

    pass_base: [0.93, 0.97, 0.86, 0.76, 0.3, 0.3],
    cross_wide_m: 16.0,
    cross_from_fwd_m: 70.0,
    aerial_scale: 30.0,
    header_logit: -0.9,
    pass_comfortable_m: 15.0,
    pass_per_m: -0.02,
    pass_passer_pressure: -0.25,
    pass_receiver_pressure: -0.2,
    pass_blocker: -0.6,
    passer_scale: 40.0,
    interceptor_scale: 45.0,
    race_scale: 20.0,
    lane_m: 2.0,
    pressure_m: 2.5,
    max_pass_m: 45.0,
    through_run_m: 10.0,
    through_reach_m: 8.0,

    value_base: 0.008,
    value_peak: 0.45,
    value_decay_m: 10.0,
    value_lateral_m: 26.0,

    temp_max: 0.012,
    temp_min: 0.003,
    quality_floor: 35.0,
    quality_ceiling: 85.0,
    style_unit: 0.01,
    style_tempo: 1.0,
    style_directness: 1.5,
    style_width: 1.0,
    risk_style: 0.6,
    tempo_pass_logit: -0.6,
    tempo_temperature: 1.0,
    tempo_drain: 0.6,
    carry_step_m: 5.0,
    take_on_step_m: 4.0,
    carry_loss_base: 0.04,
    carry_loss_pressure: 0.08,
    hold_loss_base: 0.05,
    hold_loss_pressure: 0.1,
    hold_value_factor: 0.8,

    drain_base: 0.02,
    drain_per_m: 0.008,
    stamina_mitigation: 0.5,
    fatigue_impact: 0.45,
    halftime_recovery: 0.35,
    fitness_carry: 0.5,
    counter_edge: 0.05,
    formation_edge: 0.10,
    press_drain: 0.25,
    lofted_pressure_factor: 0.0,
    shot_crowd: -0.3,
    crowd_m: 10.0,

    home_advantage: 0.04,
};
