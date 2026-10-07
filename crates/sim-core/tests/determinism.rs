// crates/sim-core/tests/determinism.rs

use sim_core::contract::{run_simulation, RawClub, RawSides, RawTactics, RawTactic, SimulateMatchRequest};
use serde_json::Value;
use std::fs;
use std::path::Path;

#[test]
fn test_simulation_determinism() {
    let pool_path = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    if !pool_path.exists() {
        return;
    }

    let content = fs::read_to_string(pool_path).expect("Read pool JSON");
    let pool: Value = serde_json::from_str(&content).expect("Parse pool JSON");
    let clubs: Vec<RawClub> = serde_json::from_value(pool.get("clubs").unwrap().clone()).unwrap();

    let build_req = |seed_str: &str| SimulateMatchRequest {
        fixture_id: "det_fixture_001".into(),
        clubs: vec![clubs[0].clone(), clubs[1].clone()],
        sides: RawSides {
            home: clubs[0].id.clone().unwrap_or_default(),
            away: clubs[1].id.clone().unwrap_or_default(),
        },
        tactics: Some(RawTactics {
            home: Some(RawTactic::simple("433", "Balanced")),
            away: Some(RawTactic::simple("442", "Balanced")),
        }),
        seed: Some(seed_str.into()),
        include_frames: None,
    };

    // Run 1 with seed "alpha_42"
    let resp1 = run_simulation(build_req("alpha_42"));
    // Run 2 with same seed "alpha_42"
    let resp2 = run_simulation(build_req("alpha_42"));
    // Run 3 with different seed "beta_99"
    let resp3 = run_simulation(build_req("beta_99"));

    let data1 = resp1.match_data.unwrap();
    let data2 = resp2.match_data.unwrap();
    let data3 = resp3.match_data.unwrap();

    // Determinism assertion: the whole match - stats, events, every frame -
    // must be byte-identical for the same seed.
    let json1 = serde_json::to_string(&data1).unwrap();
    let json2 = serde_json::to_string(&data2).unwrap();
    assert_eq!(json1, json2, "Same seed must reproduce the match exactly");
    assert_ne!(json1, serde_json::to_string(&data3).unwrap(), "A different seed must produce a different match");

    println!("Determinism verified: Run 1 and Run 2 produced 100% identical outcomes with seed 'alpha_42'.");
    println!("Run 1 Score: {}-{}, Run 3 Score (different seed): {}-{}",
        data1.Details.HomeTeamScore, data1.Details.AwayTeamScore,
        data3.Details.HomeTeamScore, data3.Details.AwayTeamScore);
}
