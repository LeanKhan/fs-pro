// crates/sim-core/tests/effects.rs
//
// Tests for the gated abilities / traits / manager orders (docs/coc-mapping/07):
//   * trigger timeline determinism
//   * empty orders/effects are inert (no trigger events)
//   * orders fire and apply a region bias
//   * per-ability effect bands (one ability moves its metric, not everything)
//   * every new action can fire, and parses from the JSON contract

use serde_json::{json, Value};
use sim_core::contract::{build_engine, resolve_effects, run_simulation, RawClub, RawEffect, RawTactics, SimulateMatchRequest};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

fn pool() -> Option<Value> {
    let path = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    path.exists().then(|| serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap())
}

/// The first two clubs that field a keeper.
fn clubs(pool: &Value) -> (Value, Value) {
    let list: Vec<&Value> = pool["clubs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["Players"].as_array().unwrap().iter().any(|p| p["Position"] == "GK"))
        .collect();
    (list[0].clone(), list[1].clone())
}

fn effect(kind: &str, params: &[(&str, f64)]) -> Value {
    let map: BTreeMap<String, f64> = params.iter().map(|(k, v)| (k.to_string(), *v)).collect();
    json!({ "kind": kind, "params": map })
}

fn request(home: &Value, away: &Value, seed: &str, frames: bool) -> SimulateMatchRequest {
    serde_json::from_value(json!({
        "fixtureId": format!("fx:{seed}"),
        "seed": seed,
        "includeFrames": frames,
        "clubs": [home, away],
        "sides": { "home": home["_id"], "away": away["_id"] },
        "tactics": {
            "home": { "formationName": "433", "styleName": "Balanced" },
            "away": { "formationName": "442", "styleName": "Balanced" }
        }
    }))
    .unwrap()
}

/// The home club with `effects` attached to every player.
fn home_with(home: &Value, effects: &[Value]) -> Value {
    let mut c = home.clone();
    for p in c["Players"].as_array_mut().unwrap() {
        p["effects"] = json!(effects);
    }
    c
}

#[derive(Default, Clone, Copy)]
#[allow(dead_code)]
struct M {
    hg: f64,
    ag: f64,
    hxg: f64,
    axg: f64,
    hshots: f64,
    ashots: f64,
    hfouls: f64,
    afouls: f64,
    hintercepts: f64,
    aintercepts: f64,
    hcards: f64,
    acards: f64,
}

fn measure(home: &Value, away: &Value, seed: &str) -> M {
    let d = run_simulation(request(home, away, seed, false)).match_data.expect("match").Details;
    let (h, a) = (&d.HomeTeamDetails, &d.AwayTeamDetails);
    let sum = |s: &sim_core::contract::SideDetails, f: fn(&sim_core::contract::PlayerStatsRow) -> u16| {
        s.PlayerStats.iter().map(|p| f(p) as f64).sum::<f64>()
    };
    M {
        hg: d.HomeTeamScore as f64,
        ag: d.AwayTeamScore as f64,
        hxg: h.XG as f64,
        axg: a.XG as f64,
        hshots: h.TotalShots as f64,
        ashots: a.TotalShots as f64,
        hfouls: h.Fouls as f64,
        afouls: a.Fouls as f64,
        hintercepts: sum(h, |p| p.Interceptions),
        aintercepts: sum(a, |p| p.Interceptions),
        hcards: (h.YellowCards + h.RedCards) as f64,
        acards: (a.YellowCards + a.RedCards) as f64,
    }
}

/// Mean difference (variant - base) and its standard error over paired seeds.
fn paired(base: &[f64], variant: &[f64]) -> (f64, f64) {
    let d: Vec<f64> = variant.iter().zip(base).map(|(v, b)| v - b).collect();
    let m = d.iter().sum::<f64>() / d.len() as f64;
    let var = d.iter().map(|x| (x - m).powi(2)).sum::<f64>() / d.len() as f64;
    (m, (var / d.len() as f64).sqrt())
}

const SEEDS: usize = 220;

fn seed(i: usize) -> String {
    format!("fx_seed_{i}")
}

// ---------------------------------------------------------------------
// Trigger determinism + inertness
// ---------------------------------------------------------------------

fn orders_tactics() -> RawTactics {
    serde_json::from_value(json!({
        "home": {
            "formationName": "433", "styleName": "Balanced",
            "orders": [
                { "kind": "OverloadFlank", "region": { "x0": 0.6, "y0": 0.0, "x1": 1.0, "y1": 0.4 },
                  "trigger": { "when": "MinuteAtLeast", "threshold": 10 } },
                { "kind": "PressTrap", "trigger": { "when": "Trailing", "threshold": 0 } }
            ]
        },
        "away": { "formationName": "442", "styleName": "Balanced" }
    }))
    .unwrap()
}

fn event_timeline(seed: &str) -> (Vec<String>, usize) {
    let Some(pool) = pool() else { return (Vec::new(), 0) };
    let (home, away) = clubs(&pool);
    let hc: RawClub = serde_json::from_value(home).unwrap();
    let ac: RawClub = serde_json::from_value(away).unwrap();
    let t = orders_tactics();
    let mut e = build_engine(&hc, &ac, Some(&t), seed);
    e.record_frames = false;
    e.simulate_full_match();
    let timeline: Vec<String> = e
        .events
        .iter()
        .map(|ev| format!("{}:{:?}:{:?}:{}", ev.tick, ev.kind, ev.player, ev.note.clone().unwrap_or_default()))
        .collect();
    (timeline, e.diag.orders_fired as usize)
}

#[test]
fn trigger_timeline_is_deterministic() {
    if pool().is_none() {
        return;
    }
    let (a, fired_a) = event_timeline("trigger_det");
    let (b, fired_b) = event_timeline("trigger_det");
    assert_eq!(a, b, "same seed + state must yield the same trigger timeline and events");
    assert_eq!(fired_a, fired_b);
    assert!(fired_a > 0, "the order set should fire at least once (got {fired_a})");
    println!("trigger determinism: {fired_a} orders fired, {} events, identical across runs", a.len());
}

#[test]
fn empty_effects_emit_no_trigger_events() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let hc: RawClub = serde_json::from_value(home).unwrap();
    let ac: RawClub = serde_json::from_value(away).unwrap();
    let t: RawTactics = serde_json::from_value(json!({
        "home": { "formationName": "433", "styleName": "Balanced" },
        "away": { "formationName": "442", "styleName": "Balanced" }
    }))
    .unwrap();
    let mut e = build_engine(&hc, &ac, Some(&t), "empty_effects");
    e.record_frames = false;
    e.simulate_full_match();
    use sim_core::types::EventKind;
    let triggers = e
        .events
        .iter()
        .filter(|ev| matches!(ev.kind, EventKind::OrderFired | EventKind::AbilityFired | EventKind::Volley | EventKind::Trivela | EventKind::TacticalFoul { .. }))
        .count();
    assert_eq!(triggers, 0, "no orders/effects must emit no trigger events");
    assert_eq!(e.diag.orders_fired, 0);
    assert_eq!(e.diag.abilities_fired, 0);
}

// ---------------------------------------------------------------------
// Per-ability effect bands
// ---------------------------------------------------------------------

#[test]
fn shot_quality_raises_xg_not_the_whole_sheet() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let base = home.clone();
    let variant = home_with(&home, &[effect("ShotQuality", &[("bonus", 1.0)])]);

    let mut bh = Vec::new();
    let mut vh = Vec::new();
    let mut bn = Vec::new();
    let mut vn = Vec::new();
    let mut bg = Vec::new();
    let mut vg = Vec::new();
    let mut bs = Vec::new();
    let mut vs = Vec::new();
    for i in 0..SEEDS {
        let b = measure(&base, &away, &seed(i));
        let v = measure(&variant, &away, &seed(i));
        // The intended metric: finishing quality (xG per shot), which is
        // isolated from the game-state feedback of shot volume.
        bh.push(b.hxg / b.hshots.max(1.0));
        vh.push(v.hxg / v.hshots.max(1.0));
        bn.push(b.hxg + b.axg);
        vn.push(v.hxg + v.axg);
        bg.push(b.hg);
        vg.push(v.hg);
        bs.push(b.hshots);
        vs.push(v.hshots);
    }
    let (d, se) = paired(&bh, &vh);
    let (dg, seg) = paired(&bg, &vg);
    let (ds, ses) = paired(&bs, &vs);
    let (dt, _) = paired(&bn, &vn);
    assert!(d > 2.0 * se, "ShotQuality should raise home xG/shot (Δ {d:+.4} ± {se:.4})");
    assert!(dg > 2.0 * seg, "ShotQuality should raise home goals (Δ {dg:+.3} ± {seg:.3})");
    assert!(dt.abs() < 0.6, "ShotQuality must not blow up the whole-match sheet (Δtotal {dt:+.3})");
    println!("ShotQuality: xG/shot {d:+.4}±{se:.4} | home goals {dg:+.3}±{seg:.3} | home shots {ds:+.2}±{ses:.2} | total xG {dt:+.3}");
}

#[test]
fn interception_ability_raises_interceptions_only() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let base = home.clone();
    let variant = home_with(&home, &[effect("Interception", &[("bonus", 0.5), ("lane", 1.0)])]);

    let mut b = Vec::new();
    let mut v = Vec::new();
    let mut bx = Vec::new();
    let mut vx = Vec::new();
    for i in 0..SEEDS {
        let bm = measure(&base, &away, &seed(i));
        let vm = measure(&variant, &away, &seed(i));
        b.push(bm.hintercepts);
        v.push(vm.hintercepts);
        bx.push(bm.hxg);
        vx.push(vm.hxg);
    }
    let (d, se) = paired(&b, &v);
    assert!(d > 2.0 * se, "Interception should raise home interceptions (Δ {d:+.3} ± {se:.3})");
    // A defensive ability must not inflate the equipped side's own attack.
    let (dx, _) = paired(&bx, &vx);
    assert!(dx.abs() < 0.6, "Interception must not change home xG (Δ {dx:+.3})");
    println!("Interception: home interceptions {d:+.3} ± {se:.3}; home xG {dx:+.3}");
}

#[test]
fn tactical_foul_raises_fouls_and_cards() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let base = home.clone();
    let variant = home_with(&home, &[effect("NewAction", &[("tacticalFoul", 1.0)])]);

    let mut bf = Vec::new();
    let mut vf = Vec::new();
    let mut bc = Vec::new();
    let mut vc = Vec::new();
    let mut bx = Vec::new();
    let mut vx = Vec::new();
    for i in 0..SEEDS {
        let b = measure(&base, &away, &seed(i));
        let v = measure(&variant, &away, &seed(i));
        bf.push(b.hfouls);
        vf.push(v.hfouls);
        bc.push(b.hcards);
        vc.push(v.hcards);
        bx.push(b.hxg);
        vx.push(v.hxg);
    }
    let (d, se) = paired(&bf, &vf);
    assert!(d > 2.0 * se, "Tactical Foul should raise home fouls (Δ {d:+.3} ± {se:.3})");
    let (dc, _) = paired(&bc, &vc);
    assert!(dc >= 0.0, "Tactical Foul must not reduce home cards (Δ {dc:+.3})");
    let (dx, _) = paired(&bx, &vx);
    assert!(dx.abs() < 0.6, "Tactical Foul must not change home xG (Δ {dx:+.3})");
    println!("TacticalFoul: home fouls {d:+.3} ± {se:.3}; home cards {dc:+.3}; home xG {dx:+.3}");
}

// ---------------------------------------------------------------------
// Every new action fires when unlocked (and never without the effect)
// ---------------------------------------------------------------------

#[test]
fn new_actions_fire_when_unlocked() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let variant = home_with(
        &home,
        &[
            effect("NewAction", &[("volley", 1.0), ("trivela", 1.0), ("throughBall", 1.0), ("sweeperRush", 1.0), ("tacticalFoul", 1.0)]),
            effect("ShotQuality", &[("bonus", 0.25), ("firstTime", 1.0)]),
        ],
    );
    let mut volleys = 0;
    let mut trivelas = 0;
    let mut through = 0;
    let mut sweepers = 0;
    let mut tactical = 0;
    for i in 0..SEEDS {
        let resp = run_simulation(request(&variant, &away, &seed(i), false));
        for ev in resp.match_data.unwrap().Events {
            match ev.event_type.as_str() {
                "volley" => volleys += 1,
                "trivela" => trivelas += 1,
                "ability" if ev.data.as_ref().and_then(|d| d["ability"].as_str()) == Some("Through Ball in Behind") => through += 1,
                "ability" if ev.data.as_ref().and_then(|d| d["ability"].as_str()) == Some("Sweeper-Keeper Rush") => sweepers += 1,
                "foul" if ev.data.as_ref().and_then(|d| d["tactical"].as_bool()) == Some(true) => tactical += 1,
                _ => {}
            }
        }
    }
    println!("new actions over {SEEDS} matches: volley {volleys} trivela {trivelas} through {through} sweeper {sweepers} tactical {tactical}");
    assert!(volleys > 0, "volley should fire at least once");
    assert!(trivelas > 0, "trivela should fire at least once");
    assert!(through > 0, "through-ball-in-behind should fire at least once");
    assert!(sweepers > 0, "sweeper rush should fire at least once");
    assert!(tactical > 0, "tactical foul should fire at least once");
}

#[test]
fn stamina_surge_fires_and_is_recorded() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let variant = home_with(&home, &[effect("StaminaSurge", &[("below", 99.0), ("amount", 40.0)])]);
    let hc: RawClub = serde_json::from_value(variant).unwrap();
    let ac: RawClub = serde_json::from_value(away).unwrap();
    let t: RawTactics = serde_json::from_value(json!({
        "home": { "formationName": "433", "styleName": "Balanced" },
        "away": { "formationName": "442", "styleName": "Balanced" }
    }))
    .unwrap();
    let mut e = build_engine(&hc, &ac, Some(&t), "surge");
    e.record_frames = false;
    e.simulate_full_match();
    let surges = e
        .events
        .iter()
        .filter(|ev| matches!(ev.kind, sim_core::types::EventKind::AbilityFired) && ev.note.as_deref() == Some("Talisman Second Wind"))
        .count();
    assert!(surges >= 10, "each home player should surge once when below threshold (got {surges})");
    assert_eq!(e.diag.abilities_fired as usize, surges, "every surge is a recorded ability event");
    println!("StaminaSurge: {surges} surges fired and recorded");
}

#[test]
fn effects_request_is_deterministic() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let variant = home_with(
        &home,
        &[
            effect("NewAction", &[("volley", 1.0), ("trivela", 1.0), ("throughBall", 1.0), ("sweeperRush", 1.0), ("tacticalFoul", 1.0)]),
            effect("ShotQuality", &[("bonus", 0.3), ("firstTime", 1.0)]),
            effect("Interception", &[("bonus", 0.3), ("lane", 1.0)]),
            effect("StaminaSurge", &[("below", 50.0), ("amount", 20.0)]),
        ],
    );
    let req = request(&variant, &away, "fx_determinism", true);
    let a = serde_json::to_string(&run_simulation(req.clone()).match_data.unwrap()).unwrap();
    let b = serde_json::to_string(&run_simulation(req).match_data.unwrap()).unwrap();
    assert_eq!(a, b, "an effects/orders request must replay byte-identically (fx substream is deterministic)");
    println!("effects request determinism: identical ({} bytes)", a.len());
}

// ---------------------------------------------------------------------
// Contract parsing
// ---------------------------------------------------------------------

#[test]
fn resolve_effects_parses_every_kind() {
    let raw: Vec<RawEffect> = serde_json::from_value(json!([
        { "kind": "Tendency", "params": { "shoot": 0.2, "dribble": 0.1, "risk": 0.05, "forwardRuns": 0.3, "press": 0.4, "roam": 0.1 } },
        { "kind": "NewAction", "params": { "volley": 1.0, "trivela": 1.0 } },
        { "kind": "CrossType", "params": { "inswing": 0.5 } },
        { "kind": "HeaderQuality", "params": { "bonus": 0.4 } },
        { "kind": "Interception", "params": { "bonus": 0.3, "lane": 1.0 } },
        { "kind": "StaminaSurge", "params": { "below": 35.0, "amount": 20.0 } },
        { "kind": "ShotQuality", "params": { "bonus": 0.25, "firstTime": 1.0 } }
    ]))
    .unwrap();
    let e = resolve_effects(&raw);
    use sim_core::types::action;
    assert!((e.tendency.shoot - 0.2).abs() < 1e-6);
    assert!((e.tendency.press - 0.4).abs() < 1e-6);
    assert!(e.has(action::VOLLEY) && e.has(action::TRIVELA));
    assert!(!e.has(action::THROUGH_BALL));
    assert!((e.cross_inswing - 0.5).abs() < 1e-6);
    assert!((e.header_bonus - 0.4).abs() < 1e-6);
    assert!((e.interception_bonus - 0.3).abs() < 1e-6 && e.interception_lane);
    assert!((e.stamina_surge_below - 35.0).abs() < 1e-6);
    assert!((e.shot_bonus - 0.25).abs() < 1e-6 && e.shot_first_time);

    // Empty = inert.
    assert!(resolve_effects(&[]).is_inert());
}

#[test]
fn unknown_order_is_inert_but_known_ones_parse() {
    let tt: RawTactics = serde_json::from_value(json!({
        "home": { "formationName": "433",
            "orders": [
                { "kind": "NotARealOrder", "trigger": { "when": "Always" } },
                { "kind": "PressTrap", "trigger": { "when": "Wheneve" } }
            ] },
        "away": {}
    }))
    .unwrap();
    // Unknown kind dropped; unknown `when` parsed but inert (Never).
    let home = tt.home.unwrap();
    assert_eq!(home.orders.len(), 2);
    assert!(sim_core::contract::parse_order(&home.orders[0]).is_none());
    let o = sim_core::contract::parse_order(&home.orders[1]).expect("PressTrap parses");
    assert_eq!(o.trigger.when, sim_core::tactics::TriggerWhen::Never);
}

// ---------------------------------------------------------------------
// Orders affect play
// ---------------------------------------------------------------------

#[test]
fn orders_apply_modifiers_and_change_play() {
    let Some(pool) = pool() else { return };
    let (home, away) = clubs(&pool);
    let base: RawTactics = serde_json::from_value(json!({
        "home": { "formationName": "433", "styleName": "Balanced" },
        "away": { "formationName": "442", "styleName": "Balanced" }
    }))
    .unwrap();
    let with_orders: RawTactics = serde_json::from_value(json!({
        "home": { "formationName": "433", "styleName": "Balanced",
            "orders": [
                { "kind": "PressTrap", "trigger": { "when": "Always" } },
                { "kind": "OverloadFlank", "region": { "x0": 0.6, "y0": 0.0, "x1": 1.0, "y1": 0.4 },
                  "trigger": { "when": "Always" } }
            ] },
        "away": { "formationName": "442", "styleName": "Balanced" }
    }))
    .unwrap();

    let hc: RawClub = serde_json::from_value(home).unwrap();
    let ac: RawClub = serde_json::from_value(away).unwrap();

    // The active modifiers are exposed per team and are what the engine folds
    // from the orders that have fired (07 §3).
    let mut e = build_engine(&hc, &ac, Some(&with_orders), "order_mods");
    e.record_frames = false;
    e.step_tick(); // tick 0: both Always orders fire
    let home_mods = e.active_order_modifiers(0);
    let away_mods = e.active_order_modifiers(1);
    assert!(home_mods.press_add > 0.0, "PressTrap must raise pressing");
    let region = home_mods.region.expect("OverloadFlank must expose its region");
    assert!((region.x0 - 0.6).abs() < 1e-6 && (region.y1 - 0.4).abs() < 1e-6);
    assert!(home_mods.region_bonus > 0.0);
    assert!(away_mods.is_empty(), "orders only affect their own side");
    assert_eq!(e.diag.orders_fired, 2);
    println!("orders: home mods press {:+.2} region {:?} bonus {:.2}", home_mods.press_add, home_mods.region, home_mods.region_bonus);

    // And they actually change the match: the event timeline differs from a
    // game with no orders, over the whole set of seeds.
    let mut fired = 0usize;
    let mut differing = 0usize;
    for i in 0..64 {
        let mut b = build_engine(&hc, &ac, Some(&base), &seed(i));
        b.record_frames = false;
        b.simulate_full_match();
        let mut o = build_engine(&hc, &ac, Some(&with_orders), &seed(i));
        o.record_frames = false;
        o.simulate_full_match();
        fired += o.diag.orders_fired as usize;
        let timeline = |e: &sim_core::engine::MatchEngine| {
            e.events
                .iter()
                .map(|ev| format!("{}:{:?}:{:?}", ev.tick, ev.kind, ev.player))
                .collect::<Vec<_>>()
        };
        if timeline(&b) != timeline(&o) {
            differing += 1;
        }
    }
    assert_eq!(fired, 64 * 2, "each order fires exactly once per match");
    assert!(differing > 0, "orders must change at least some matches ({differing}/64)");
    println!("orders: {}/64 matches changed by the orders", differing);
}
