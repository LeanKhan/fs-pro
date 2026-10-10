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
use sim_core::contract::{run_simulation, SimulateMatchRequest};
use std::fs;
use std::path::Path;
use std::time::Instant;

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

    let rounds = 6;
    let (mut best_base, mut best_order) = (f64::MAX, f64::MAX);
    for _ in 0..rounds {
        let t = Instant::now();
        for r in &base {
            let _ = run_simulation(r.clone());
        }
        best_base = best_base.min(t.elapsed().as_secs_f64());

        let t = Instant::now();
        for r in &with_order {
            let _ = run_simulation(r.clone());
        }
        best_order = best_order.min(t.elapsed().as_secs_f64());
    }
    let overhead = 100.0 * (best_order - best_base) / best_base;
    println!(
        "BENCH trigger overhead = {overhead:+.2}% (base {:.1} ms, with-order {:.1} ms over {} matches, min of {rounds})",
        best_base * 1000.0 / base.len() as f64,
        best_order * 1000.0 / base.len() as f64,
        base.len()
    );
    assert!(overhead < 5.0, "trigger machinery overhead must stay well under 5% (got {overhead:+.2}%)");
}
