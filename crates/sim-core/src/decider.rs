// crates/sim-core/src/decider.rs
//
// What the ball carrier does. Every option is a candidate scored by its
// expected value in one currency - the probability the possession ends in
// a goal (model::possession_value):
//
//   EV = P(success) * value(where the ball ends up)
//        - P(failure) * cost(losing it there) * risk weight
//        + team-instruction and role biases
//
// P(success) comes from the SAME model the engine resolves the action
// with, so a player never misjudges risk in a way the outcome disagrees
// with. The choice is a softmax over EVs: a player with good decision-
// making (Mental/Vision) almost always takes the best option, a poor one
// is erratic - so decision quality is a real attribute.

use crate::config::CFG;
use crate::geom::Vec2;
use crate::model::{self, PassKind, ShotKind};
use crate::tactics::TeamTactics;
use crate::types::{PositionCategory, SimPlayer};
use rand::Rng;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ActionChoice {
    Shoot,
    Pass { target_idx: usize, target: Vec2, kind: PassKind },
    Carry { to: Vec2 },
    TakeOn { defender_idx: usize, to: Vec2 },
    Hold,
    Clear { to: Vec2 },
}

struct Candidate {
    action: ActionChoice,
    ev: f32,
}

/// Point `step_m` metres from `from` towards `towards`, kept on the pitch.
fn step_towards(from: Vec2, towards: Vec2, step_m: f32) -> Vec2 {
    let (a, b) = (model::to_m(from), model::to_m(towards));
    let d = Vec2::new(b.x - a.x, b.y - a.y).normalize();
    model::from_m(Vec2::new(a.x + d.x * step_m, a.y + d.y * step_m)).clamp_pitch()
}

pub fn decide<R: Rng>(
    carrier_idx: usize,
    players: &[SimPlayer],
    tactics: &TeamTactics,
    ltr: bool,
    keeper: Option<usize>,
    rng: &mut R,
) -> ActionChoice {
    let carrier = &players[carrier_idx];
    let team = carrier.team_index;
    let pos = carrier.pos;
    let tend = carrier.role.tendencies();
    let is_gk = carrier.position == PositionCategory::GK;

    let pressure = model::pressure_at(pos, players, team, CFG.pressure_m) as f32;
    let here_value = model::possession_value(pos, ltr);
    let cost_here = model::turnover_cost(pos, ltr);
    let line_m = model::offside_line_m(players, team, ltr);
    let my_fwd = model::fwd_m(pos, ltr);

    // Instructions, centred on neutral (0.5).
    let unit = CFG.style_unit;
    let tempo = tactics.tempo - 0.5;
    let direct = tactics.directness - 0.5;
    let width = tactics.width - 0.5;
    let risk = (1.0 - CFG.risk_style * (tempo + direct)) * (1.25 - 0.5 * tend.risk_appetite);

    let mut cands: Vec<Candidate> = Vec::with_capacity(24);

    // 1. Shoot.
    if !is_gk && model::dist_m(pos, model::goal_of(ltr)) <= CFG.max_shot_m {
        let shot = model::shot_model(carrier, keeper.map(|k| &players[k]), players, ltr, ShotKind::OpenPlay);
        cands.push(Candidate {
            action: ActionChoice::Shoot,
            ev: shot.p_goal + (tend.shoot_bias - 0.5) * unit + tempo * CFG.style_tempo * 0.25 * unit,
        });
    }

    // 2. Passes - to feet, and (for forwards and midfielders) into space
    //    behind the defence.
    for (i, mate) in players.iter().enumerate() {
        if mate.team_index != team || i == carrier_idx || mate.is_sent_off {
            continue;
        }
        let distance = model::dist_m(pos, mate.pos);
        if !(3.0..=CFG.max_pass_m).contains(&distance) {
            continue;
        }
        let mate_fwd = model::fwd_m(mate.pos, ltr);
        let kind = PassKind::classify(pos, mate.pos, ltr);
        // A run into the box is timed to arrive with the cross.
        let offside = mate_fwd > line_m && mate_fwd > my_fwd && kind != PassKind::Cross;

        if !offside {
            let pm = model::pass_model(carrier, mate, mate.pos, kind, players, tactics.tempo);
            let receiver_pressure = model::pressure_at(mate.pos, players, team, CFG.pressure_m + 0.5) as f32;
            // A cross is met first time: what it's worth is the header.
            let value = if kind == PassKind::Cross {
                model::shot_model(mate, keeper.map(|k| &players[k]), players, ltr, ShotKind::Header).p_goal
            } else {
                model::possession_value(mate.pos, ltr) * (1.0 - 0.1 * receiver_pressure).max(0.5)
            };
            let fail_at = pm.interceptor.map_or(mate.pos, |d| players[d].pos);
            let progress = mate_fwd - my_fwd;
            let bias = match kind {
                PassKind::Long => direct * CFG.style_directness * unit,
                PassKind::Short => -direct * CFG.style_directness * 0.5 * unit,
                PassKind::Backward => -direct * CFG.style_directness * 0.5 * unit - tempo * CFG.style_tempo * unit,
                PassKind::Wide => width * CFG.style_width * unit,
                PassKind::Through => 0.0,
                PassKind::Cross => width * CFG.style_width * 1.5 * unit,
            } + if progress > 0.0 { tempo * CFG.style_tempo * 0.5 * unit } else { 0.0 }
                + if progress > 10.0 { (tend.direct_pass_bias - 0.5) * unit } else { 0.0 };
            cands.push(Candidate {
                action: ActionChoice::Pass { target_idx: i, target: mate.pos, kind },
                ev: pm.p_complete * value - (1.0 - pm.p_complete) * model::turnover_cost(fail_at, ltr) * risk + bias,
            });
        }

        let runner = matches!(mate.position, PositionCategory::ATT | PositionCategory::MID);
        if runner && !offside && mate_fwd > my_fwd - 5.0 {
            if let Some(target) = model::through_target(mate, line_m, ltr) {
                // Only a through ball if it lands behind the defensive line.
                if model::fwd_m(target, ltr) > line_m && model::dist_m(pos, target) <= CFG.max_pass_m {
                    let pm = model::pass_model(carrier, mate, target, PassKind::Through, players, tactics.tempo);
                    let fail_at = pm.interceptor.map_or(target, |d| players[d].pos);
                    cands.push(Candidate {
                        action: ActionChoice::Pass { target_idx: i, target, kind: PassKind::Through },
                        ev: pm.p_complete * model::possession_value(target, ltr)
                            - (1.0 - pm.p_complete) * model::turnover_cost(fail_at, ltr) * risk
                            + direct * CFG.style_directness * unit
                            + (tend.direct_pass_bias - 0.5) * unit,
                    });
                }
            }
        }
    }

    if !is_gk {
        let goal = model::goal_of(ltr);
        // The man to beat: the nearest opponent standing in the path of a
        // carry towards goal (within 2m of it) - you can't run through him.
        let carry_to = step_towards(pos, goal, CFG.carry_step_m);
        let blocker = players
            .iter()
            .enumerate()
            .filter(|(_, d)| {
                d.team_index != team
                    && !d.is_sent_off
                    && model::fwd_m(d.pos, ltr) >= my_fwd - 1.0
                    && model::seg_dist_m(d.pos, pos, carry_to) <= CFG.contact_m
            })
            .map(|(i, d)| (i, model::dist_m(pos, d.pos)))
            .min_by(|a, b| a.1.total_cmp(&b.1));

        match blocker {
            // 3. Take him on.
            Some((d, _)) => {
                let to = step_towards(pos, goal, CFG.take_on_step_m);
                let p = model::dribble_probability(carrier, &players[d], players);
                cands.push(Candidate {
                    action: ActionChoice::TakeOn { defender_idx: d, to },
                    ev: p * model::possession_value(to, ltr) - (1.0 - p) * cost_here * risk + (tend.dribble_bias - 0.5) * unit,
                });
            }
            // 4. Or carry it into open grass.
            None => {
                let to = carry_to;
                let q = CFG.carry_loss_base + CFG.carry_loss_pressure * pressure;
                cands.push(Candidate {
                    action: ActionChoice::Carry { to },
                    ev: (1.0 - q) * model::possession_value(to, ltr) - q * cost_here * risk + tempo * CFG.style_tempo * 0.5 * unit,
                });
            }
        }
    }

    // 5. Hold it up / wait for support - keeping the ball, but stalling.
    let q = CFG.hold_loss_base + CFG.hold_loss_pressure * pressure;
    cands.push(Candidate {
        action: ActionChoice::Hold,
        ev: (1.0 - q) * here_value * CFG.hold_value_factor - q * cost_here * risk - tempo * CFG.style_tempo * unit,
    });

    // 6. Clear it - defenders and keepers under pressure in their own third.
    if (is_gk || carrier.position == PositionCategory::DEF) && my_fwd < 35.0 && pressure >= 1.0 {
        let to_fwd = 60.0 / crate::geom::PITCH_LENGTH_METERS;
        let to = Vec2::new(if ltr { to_fwd } else { 1.0 - to_fwd }, rng.gen_range(0.25..0.75));
        cands.push(Candidate { action: ActionChoice::Clear { to }, ev: -model::turnover_cost(to, ltr) });
    }

    choose(&cands, decision_temperature(carrier) * (1.0 + CFG.tempo_temperature * tempo).max(0.25), rng)
}

fn decision_temperature(p: &SimPlayer) -> f32 {
    let q = ((model::decision_quality(&p.attributes) - CFG.quality_floor) / (CFG.quality_ceiling - CFG.quality_floor)).clamp(0.0, 1.0);
    CFG.temp_max - q * (CFG.temp_max - CFG.temp_min)
}

/// Softmax draw over expected values.
fn choose<R: Rng>(cands: &[Candidate], temperature: f32, rng: &mut R) -> ActionChoice {
    let top = cands.iter().map(|c| c.ev).fold(f32::MIN, f32::max);
    let weights: Vec<f32> = cands.iter().map(|c| ((c.ev - top) / temperature).exp()).collect();
    let mut roll = rng.r#gen::<f32>() * weights.iter().sum::<f32>();
    for (c, w) in cands.iter().zip(&weights) {
        roll -= w;
        if roll <= 0.0 {
            return c.action;
        }
    }
    cands.last().map_or(ActionChoice::Hold, |c| c.action)
}
