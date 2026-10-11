// crates/sim-core/tests/bench_throughput.rs
//
// Single-threaded throughput benchmark: matches/second/core on a fixed,
// deterministic fixture set, headless (no replay frames). Run with
//
//   cargo test --release --test bench_throughput -- --nocapture
//
// The parity/effect tests reuse `fixed_fixtures` so "before" and "after"
// numbers are directly comparable: the only thing that changes is the engine.

use serde_json::Value;
use sim_core::contract::{SimulateMatchRequest, build_engine, run_simulation};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

/// Serialize the two wall-clock benchmarks. They measure single-threaded
/// throughput on the machine, so if the test harness runs them in parallel
/// (the default `cargo test` behaviour) they share a core and the numbers -
/// and the trigger-overhead ratio in particular (OW-F05) - become noise. The
/// lock keeps a plain `cargo test --release` stable without a special gate.
static BENCH_LOCK: Mutex<()> = Mutex::new(());

pub struct Fixture {
    pub home: Value,
    pub away: Value,
    pub seed: String,
}

/// The roster pool every test in this crate uses (skipped if absent).
pub fn pool_path() -> std::path::PathBuf {
    let p = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    p.to_path_buf()
}

pub fn fixed_fixtures(count: usize) -> Option<Vec<Fixture>> {
    let path = pool_path();
    if !path.exists() {
        return None;
    }
    let pool: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let clubs: Vec<Value> = pool["clubs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["Players"].as_array().is_some_and(|ps| ps.iter().any(|p| p["Position"] == "GK")))
        .cloned()
        .collect();
    let mut x: u64 = 0x9e37_79b9_7f4a_7c15;
    let mut next = |n: usize| {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        (x % n as u64) as usize
    };
    Some(
        (0..count)
            .map(|i| {
                let a = next(clubs.len());
                let mut b = next(clubs.len());
                while b == a {
                    b = next(clubs.len());
                }
                Fixture { home: clubs[a].clone(), away: clubs[b].clone(), seed: format!("bench:{i}") }
            })
            .collect(),
    )
}

pub fn request(f: &Fixture) -> SimulateMatchRequest {
    serde_json::from_value(serde_json::json!({
        "fixtureId": f.seed,
        "seed": f.seed,
        "includeFrames": false,
        "clubs": [f.home, f.away],
        "sides": { "home": f.home["_id"], "away": f.away["_id"] },
        "tactics": {
            "home": { "formationName": "433", "styleName": "Balanced" },
            "away": { "formationName": "442", "styleName": "Balanced" }
        }
    }))
    .unwrap()
}

#[test]
fn bench_matches_per_second_per_core() {
    let _serial = BENCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let Some(fixtures) = fixed_fixtures(240) else {
        eprintln!("roster pool missing; skipping throughput bench");
        return;
    };
    let reqs: Vec<SimulateMatchRequest> = fixtures.iter().map(request).collect();

    // Warm-up (page in the code paths).
    for r in &reqs[..24] {
        let _ = run_simulation(r.clone());
    }

    let rounds = 3;
    let mut best = f64::MIN;
    let mut best_ms = f64::MAX;
    for _ in 0..rounds {
        let t = Instant::now();
        for r in &reqs {
            let _ = run_simulation(r.clone());
        }
        let secs = t.elapsed().as_secs_f64();
        let mps = reqs.len() as f64 / secs;
        if mps > best {
            best = mps;
            best_ms = secs * 1000.0 / reqs.len() as f64;
        }
    }
    println!("BENCH matches/sec/core = {best:.1}  ({best_ms:.3} ms/match, {rounds} rounds of {}, single thread)", reqs.len());
}

/// The trigger system's overhead, measured in-process and paired: the same
/// fixtures run with no orders, and with one **inert** `Balanced` order that
/// fires at kick-off. `Balanced` folds to zero modifiers, so the match outcome
/// and RNG stream are identical - only the trigger machinery's cost differs,
/// including the per-tick evaluation, the modifier fold and the event.
#[test]
fn bench_trigger_overhead() {
    let _serial = BENCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let Some(fixtures) = fixed_fixtures(300) else {
        eprintln!("roster pool missing; skipping trigger overhead bench");
        return;
    };
    let base: Vec<SimulateMatchRequest> = fixtures.iter().map(request).collect();
    let inert_order: sim_core::contract::RawOrder = serde_json::from_value(serde_json::json!({
        "kind": "Balanced", "trigger": { "when": "Always" }
    }))
    .unwrap();
    let with_order: Vec<SimulateMatchRequest> = fixtures
        .iter()
        .map(|f| {
            let mut r = request(f);
            if let Some(h) = r.tactics.as_mut().and_then(|t| t.home.as_mut()) {
                h.orders = vec![inert_order.clone()];
            }
            r
        })
        .collect();

    // The inert order must not change the match outcome (RNG untouched).
    let mut filtered = base[0].clone();
    filtered.tactics.as_mut().unwrap().home.as_mut().unwrap().orders = vec![inert_order.clone()];
    let d0 = run_simulation(base[0].clone()).match_data.unwrap().Details;
    let d1 = run_simulation(filtered).match_data.unwrap().Details;
    assert_eq!(
        (d0.HomeTeamScore, d0.AwayTeamScore, d0.TotalPasses),
        (d1.HomeTeamScore, d1.AwayTeamScore, d1.TotalPasses),
        "an inert order must not change the match"
    );

    for r in base.iter().take(20) {
        let _ = run_simulation(r.clone());
    }
    for r in with_order.iter().take(20) {
        let _ = run_simulation(r.clone());
    }

    // Paired, per-fixture interleaved measurement: for each fixture, time the
    // order-free match and the inert-order match back-to-back, then sum. Load
    // and thermal drift move both members of a pair together (they are
    // microseconds apart), so the aggregate ratio cancels them where a
    // round-level min-vs-min of separate runs does not (OW-F05). On a quiet
    // machine this reads ~0%; the eval_triggers fast-path skips the per-tick
    // trigger-state build once every order has fired.
    let rounds = 4;
    let (mut t_base, mut t_order) = (0.0f64, 0.0f64);
    for _ in 0..rounds {
        for (b, o) in base.iter().zip(&with_order) {
            let t = Instant::now();
            let _ = run_simulation(b.clone());
            t_base += t.elapsed().as_secs_f64();

            let t = Instant::now();
            let _ = run_simulation(o.clone());
            t_order += t.elapsed().as_secs_f64();
        }
    }
    let overhead = 100.0 * (t_order - t_base) / t_base;
    println!(
        "BENCH trigger overhead = {overhead:+.2}% (per-fixture interleaved, {rounds} rounds of {} paired matches) base {:.2} ms, with-order {:.2} ms per match",
        base.len(),
        t_base * 1000.0 / (rounds * base.len()) as f64,
        t_order * 1000.0 / (rounds * base.len()) as f64,
    );
    assert!(overhead < 3.0, "trigger machinery overhead must stay under 3% (got {overhead:+.2}%)");
}

/// The OW-P03 ability-trigger overhead: the same three effects per player, once
/// folded at build (no trigger) and once routed through the trigger machinery
/// with a trigger that is true from kick-off (`MinuteAtLeast 0`, active all
/// match). The two matches are byte-identical, so the difference is purely the
/// per-tick trigger evaluation - budget under 2%.
#[test]
fn bench_ability_trigger_overhead() {
    let _serial = BENCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let Some(fixtures) = fixed_fixtures(300) else {
        eprintln!("roster pool missing; skipping ability trigger overhead bench");
        return;
    };
    let with_effects = |r: &mut SimulateMatchRequest, gated: bool| {
        let effects: Vec<sim_core::contract::RawEffect> = if gated {
            serde_json::from_value(serde_json::json!([
                { "kind": "Tendency", "params": { "press": 0.2 }, "trigger": { "when": "minute_at_least", "threshold": 0.0 } },
                { "kind": "Interception", "params": { "bonus": 0.2 }, "trigger": { "when": "minute_at_least", "threshold": 0.0 } },
                { "kind": "ShotQuality", "params": { "bonus": 0.2 }, "trigger": { "when": "minute_at_least", "threshold": 0.0 } }
            ]))
            .unwrap()
        } else {
            serde_json::from_value(serde_json::json!([
                { "kind": "Tendency", "params": { "press": 0.2 } },
                { "kind": "Interception", "params": { "bonus": 0.2 } },
                { "kind": "ShotQuality", "params": { "bonus": 0.2 } }
            ]))
            .unwrap()
        };
        for club in r.clubs.iter_mut() {
            if let Some(players) = club.players.as_mut() {
                for p in players.iter_mut() {
                    p.effects = effects.clone();
                }
            }
        }
    };
    let base: Vec<SimulateMatchRequest> = fixtures
        .iter()
        .map(|f| {
            let mut r = request(f);
            with_effects(&mut r, false);
            r
        })
        .collect();
    let with_trigger: Vec<SimulateMatchRequest> = fixtures
        .iter()
        .map(|f| {
            let mut r = request(f);
            with_effects(&mut r, true);
            r
        })
        .collect();

    // A trigger that holds from kick-off is byte-identical to folding at build.
    let d0 = serde_json::to_string(&run_simulation(base[0].clone()).match_data.unwrap()).unwrap();
    let d1 = serde_json::to_string(&run_simulation(with_trigger[0].clone()).match_data.unwrap()).unwrap();
    assert_eq!(d0, d1, "a trigger true from kick-off must reproduce the ungated match");

    for r in base.iter().take(20) {
        let _ = run_simulation(r.clone());
    }
    for r in with_trigger.iter().take(20) {
        let _ = run_simulation(r.clone());
    }

    let rounds = 4;
    let seed_of = |r: &SimulateMatchRequest| r.seed.clone().unwrap_or_default();
    let tick = |r: &SimulateMatchRequest| {
        let mut e = build_engine(&r.clubs[0], &r.clubs[1], r.tactics.as_ref(), &seed_of(r));
        e.record_frames = false;
        e
    };
    let (mut t_base, mut t_trig) = (0.0f64, 0.0f64);
    for _ in 0..rounds {
        for (b, w) in base.iter().zip(&with_trigger) {
            let mut eb = tick(b);
            let t = Instant::now();
            eb.simulate_full_match();
            t_base += t.elapsed().as_secs_f64();

            let mut ew = tick(w);
            let t = Instant::now();
            ew.simulate_full_match();
            t_trig += t.elapsed().as_secs_f64();
        }
    }
    let overhead = 100.0 * (t_trig - t_base) / t_base;
    println!(
        "BENCH ability trigger overhead = {overhead:+.2}% (tick loop, per-fixture interleaved, {rounds} rounds of {} paired matches)",
        base.len()
    );
    assert!(overhead < 2.0, "ability trigger overhead must stay under 2% (got {overhead:+.2}%)");
}
