// crates/sim-core/tests/parity.rs
//
// The load-bearing guarantee of `07` §7a (option A, derived substreams):
// a request with empty `orders` and empty `effects` must consume ZERO extra
// RNG draws and produce BYTE-IDENTICAL output to the pre-abilities engine.
//
// The three hashes below were captured from the engine before any of the
// abilities work landed (FNV-1a 64 over `serde_json::to_string(match_data)`).
// They are the regression lock: any accidental new draw or changed branch
// in an effects-free match breaks this test.

use serde_json::Value;
use sim_core::contract::{run_simulation, SimulateMatchRequest};
use std::fs;
use std::path::Path;

fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

fn request(seed: &str, frames: bool) -> Option<SimulateMatchRequest> {
    let path = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    if !path.exists() {
        return None;
    }
    let pool: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let clubs: Vec<Value> = pool["clubs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["Players"].as_array().unwrap().iter().any(|p| p["Position"] == "GK"))
        .cloned()
        .collect();
    let (home, away) = (&clubs[0], &clubs[1]);
    Some(
        serde_json::from_value(serde_json::json!({
            "fixtureId": "parity_fixture",
            "seed": seed,
            "includeFrames": frames,
            "clubs": [home, away],
            "sides": { "home": home["_id"], "away": away["_id"] },
            "tactics": {
                "home": { "formationName": "433", "styleName": "Balanced" },
                "away": { "formationName": "442", "styleName": "Balanced" }
            }
        }))
        .unwrap(),
    )
}

fn hash(seed: &str, frames: bool) -> Option<u64> {
    let resp = run_simulation(request(seed, frames)?);
    let data = resp.match_data.expect("match");
    Some(fnv(serde_json::to_string(&data).unwrap().as_bytes()))
}

/// Empty effects/orders: byte-identical to the pre-abilities build.
#[test]
fn empty_effects_are_byte_identical_to_baseline() {
    // (seed, include_frames, golden FNV hash of match_data)
    let cases = [
        ("parity_golden", true, 0x2aa6_06ab_f903_3bd5u64),
        ("parity_noframes", false, 0x8f17_c7cd_470d_2391u64),
        ("parity_alpha", true, 0x884c_823d_769c_99adu64),
    ];
    for (seed, frames, golden) in cases {
        let Some(got) = hash(seed, frames) else {
            eprintln!("roster pool missing; skipping parity test");
            return;
        };
        assert_eq!(
            got, golden,
            "empty-effects parity broke for seed={seed} frames={frames}: got {got:016x}, expected {golden:016x}"
        );
    }
    println!("parity: 3/3 empty-effects goldens matched (RNG untouched)");
}
