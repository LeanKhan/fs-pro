// crates/sim-core/tests/realism_bench.rs

use sim_core::contract::{run_simulation, RawClub, RawSides, RawTactics, RawTactic, SimulateMatchRequest};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::Instant;

#[test]
fn test_realism_benchmark_100_matches() {
    let pool_path = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    if !pool_path.exists() {
        eprintln!("Roster pool not found at {:?}, skipping file-based test", pool_path);
        return;
    }

    let content = fs::read_to_string(pool_path).expect("Read pool JSON");
    let pool: Value = serde_json::from_str(&content).expect("Parse pool JSON");

    let clubs_val = pool.get("clubs").expect("clubs array");
    let clubs: Vec<RawClub> = serde_json::from_value(clubs_val.clone()).expect("parse clubs");
    assert!(clubs.len() >= 2, "Must have at least 2 clubs in pool");

    println!("\n=======================================================");
    println!("      FSPro Rust Simulation Engine Realism Test        ");
    println!("=======================================================");
    println!("Loaded {} clubs from pool.", clubs.len());

    let match_count = 100;
    let mut total_goals = 0;
    let mut total_shots = 0;
    let mut total_shots_on_target = 0;
    let mut total_passes = 0;
    let mut total_passes_completed = 0;
    let mut total_tackles = 0;
    let mut total_fouls = 0;
    let mut total_sim_ms = 0.0;

    let start_all = Instant::now();

    for i in 0..match_count {
        let home_idx = i % clubs.len();
        let away_idx = (i + 1) % clubs.len();

        let home_club = &clubs[home_idx];
        let away_club = &clubs[away_idx];

        let req = SimulateMatchRequest {
            fixture_id: format!("test_fixture_{}", i),
            clubs: vec![home_club.clone(), away_club.clone()],
            sides: RawSides {
                home: home_club.id.clone().unwrap_or_default(),
                away: away_club.id.clone().unwrap_or_default(),
            },
            tactics: Some(RawTactics {
                home: Some(RawTactic::simple("433", "Balanced")),
                away: Some(RawTactic::simple("442", "Balanced")),
            }),
            seed: Some(format!("bench_seed_{}", i)),
            include_frames: Some(false),
        };

        let resp = run_simulation(req);
        assert!(resp.ok, "Simulation must succeed");
        let data = resp.match_data.expect("Match data present");
        let d = data.Details;

        total_goals += (d.HomeTeamScore + d.AwayTeamScore) as u32;
        let (h, a) = (&d.HomeTeamDetails, &d.AwayTeamDetails);
        total_shots += (h.TotalShots + a.TotalShots) as u32;
        total_shots_on_target += (h.ShotsOnTarget + a.ShotsOnTarget) as u32;
        total_passes += (h.PassesAttempted + a.PassesAttempted) as u32;
        total_passes_completed += (h.Passes + a.Passes) as u32;
        total_tackles += (h.Tackles + a.Tackles) as u32;
        total_fouls += (h.Fouls + a.Fouls) as u32;
        total_sim_ms += resp.metrics.simulationMs;
    }

    let elapsed = start_all.elapsed();
    let n = match_count as f32;

    println!("\nSimulated {} matches in {:.2?} (avg {:.2} ms/match)", match_count, elapsed, total_sim_ms / (match_count as f64));
    println!("Throughput: {:.0} matches/second/core", (match_count as f64) / elapsed.as_secs_f64());
    println!("-------------------------------------------------------");
    println!("Goals per match:           {:.2}  (Ref: 2.0 - 3.2)", total_goals as f32 / n);
    println!("Shots per match:           {:.2}  (Ref: 18 - 30)", total_shots as f32 / n);
    println!("Shots on target / match:   {:.2}  (Ref: 6 - 12)", total_shots_on_target as f32 / n);
    println!("Passes per match:          {:.2}  (Ref: 600 - 1100)", total_passes as f32 / n);
    println!("Pass completion %:         {:.1}% (Ref: 75% - 88%)", (total_passes_completed as f32 / total_passes.max(1) as f32) * 100.0);
    println!("Tackles per match:         {:.2}  (Ref: 25 - 45)", total_tackles as f32 / n);
    println!("Fouls per match:           {:.2}  (Ref: 18 - 28)", total_fouls as f32 / n);
    println!("=======================================================\n");

    assert!(total_goals > 0, "Matches must produce goals");
    assert!(total_shots > 0, "Matches must produce shots");
}
