// crates/sim-core/tests/contract.rs
//
// The request/response contract with the TypeScript server: real squads are
// read, the XI is a sensible one, and the response has the shape the TS
// pipeline consumes. Each test guards a bug that once made the engine run
// on placeholder players or be ignored by the caller entirely.

use serde_json::{json, Value};
use sim_core::contract::{run_simulation, seed_from_str, SimulateMatchRequest};
use std::fs;
use std::path::Path;

fn pool() -> Option<Value> {
    let path = Path::new("../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json");
    path.exists()
        .then(|| serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap())
}

/// A request exactly as the TS server sends it (`Players`, `_id`, ...).
fn ts_request(home: &Value, away: &Value, seed: &str) -> SimulateMatchRequest {
    serde_json::from_value(json!({
        "fixtureId": "contract_fixture",
        "seed": seed,
        "clubs": [home, away],
        "sides": { "home": home["_id"], "away": away["_id"] },
        "tactics": {
            "home": { "formationName": "433", "styleName": "Balanced" },
            "away": { "formationName": "442", "styleName": "Balanced" }
        }
    }))
    .unwrap()
}

fn two_clubs_with_keepers(pool: &Value) -> (Value, Value) {
    let clubs: Vec<&Value> = pool["clubs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["Players"].as_array().unwrap().iter().any(|p| p["Position"] == "GK"))
        .collect();
    (clubs[0].clone(), clubs[1].clone())
}

#[test]
fn reads_the_real_squad_and_puts_a_keeper_in_goal() {
    let Some(pool) = pool() else { return };
    let (home, away) = two_clubs_with_keepers(&pool);
    let resp = run_simulation(ts_request(&home, &away, "contract"));
    let m = resp.match_data.expect("match");

    for (side, club) in [(0usize, &home), (11usize, &away)] {
        let ids: Vec<&str> = club["Players"].as_array().unwrap().iter().map(|p| p["_id"].as_str().unwrap()).collect();
        let xi = &m.Frames.roster[side..side + 11];
        assert!(xi.iter().all(|p| ids.contains(&p.id.as_str())), "every starter must come from the club's squad");
        assert_eq!(xi[0].pos, "GK", "slot 0 must be the goalkeeper");
    }
}

#[test]
fn honours_the_managers_lineup() {
    let Some(pool) = pool() else { return };
    let (mut home, away) = two_clubs_with_keepers(&pool);
    let players = home["Players"].as_array().unwrap().clone();
    // The keeper plus the 10 LOWEST-rated outfielders - not what rating
    // order would pick, so the lineup must be what decides it.
    let gk = players.iter().find(|p| p["Position"] == "GK").unwrap();
    let mut outfield: Vec<&Value> = players.iter().filter(|p| p["Position"] != "GK").collect();
    outfield.sort_by(|a, b| a["Rating"].as_f64().unwrap_or(0.0).total_cmp(&b["Rating"].as_f64().unwrap_or(0.0)));
    let chosen: Vec<Value> = std::iter::once(gk).chain(outfield.into_iter().take(10)).map(|p| p["_id"].clone()).collect();
    home["Lineup"] = json!({ "startingXI": chosen, "bench": [] });

    let m = run_simulation(ts_request(&home, &away, "lineup")).match_data.unwrap();
    let starters: Vec<Value> = m.Frames.roster[..11].iter().map(|p| json!(p.id)).collect();
    for id in &chosen {
        assert!(starters.contains(id), "lineup player {id} must start");
    }
}

#[test]
fn response_has_the_ts_shape() {
    let Some(pool) = pool() else { return };
    let (home, away) = two_clubs_with_keepers(&pool);
    let resp = run_simulation(ts_request(&home, &away, "shape"));
    let v: Value = serde_json::to_value(&resp).unwrap();

    assert!(v.get("match").is_some(), "the TS worker reads `match`");
    let d = &v["match"]["Details"];
    for key in ["Draw", "Winner", "Loser", "MOTM", "HomeTeamScore", "AwayTeamScore", "HomeTeamDetails", "AwayTeamDetails"] {
        assert!(d.get(key).is_some(), "Details.{key} missing");
    }
    let side = &d["HomeTeamDetails"];
    for key in ["ClubId", "Possession", "TotalShots", "PlayerStats", "Won", "Drew", "XG"] {
        assert!(side.get(key).is_some(), "HomeTeamDetails.{key} missing");
    }
    assert_eq!(side["PlayerStats"].as_array().unwrap().len(), 11);

    let events = v["match"]["Events"].as_array().unwrap();
    assert!(events.iter().any(|e| e["type"] == "match"), "kick-off / half / full-time markers");
    let goals = d["HomeTeamScore"].as_u64().unwrap() + d["AwayTeamScore"].as_u64().unwrap();
    let goal_events = events.iter().filter(|e| e["type"] == "goal").count() as u64;
    assert_eq!(goal_events, goals, "one goal event per goal");
    for e in events.iter().filter(|e| e["type"] == "goal") {
        assert!(e["playerID"].is_string() && e["playerTeamID"].is_string() && e["time"].is_string());
    }
}

/// FNV-1a is pinned so a seed means the same match on every build.
#[test]
fn seed_hash_is_stable() {
    assert_eq!(seed_from_str(""), 0xcbf2_9ce4_8422_2325);
    assert_eq!(seed_from_str("a"), 0xaf63_dc4c_8601_ec8c);
}

/// No seed = a new match every time; the echoed seed reproduces a run.
#[test]
fn unseeded_runs_differ_and_echoed_seed_reproduces() {
    let Some(pool) = pool() else { return };
    let (home, away) = two_clubs_with_keepers(&pool);
    let mut req = ts_request(&home, &away, "unused");
    req.seed = None;

    let a = run_simulation(req.clone());
    let b = run_simulation(req.clone());
    let frames = |r: &sim_core::contract::SimulateMatchResponse| serde_json::to_string(&r.match_data.as_ref().unwrap().Frames).unwrap();
    assert_ne!(a.seed, b.seed);
    assert_ne!(frames(&a), frames(&b), "the same fixture played twice is a different match");

    req.seed = a.seed.clone();
    assert_eq!(frames(&a), frames(&run_simulation(req)), "the echoed seed replays that exact run");
}

/// The packed replay format the TS server decodes (realtime/packedFrames.ts).
#[test]
fn frames_are_packed_and_small() {
    let Some(pool) = pool() else { return };
    let (home, away) = two_clubs_with_keepers(&pool);
    let resp = run_simulation(ts_request(&home, &away, "packed"));
    let v: Value = serde_json::to_value(&resp).unwrap();
    let f = &v["match"]["Frames"];

    assert_eq!(f["format"], "packed-v1");
    let frames = f["tick"].as_array().unwrap().len();
    let roster = f["roster"].as_array().unwrap().len();
    assert_eq!(frames, 720);
    assert_eq!(roster, 22);
    assert_eq!(f["xy"].as_array().unwrap().len(), frames * roster * 2);
    assert_eq!(f["ball"].as_array().unwrap().len(), frames * 2);
    assert_eq!(f["holder"].as_array().unwrap().len(), frames);
    // Events sit on frames: [frameIndex, event].
    let goals = f["events"].as_array().unwrap().iter().filter(|e| e[1]["type"] == "goal").count() as u64;
    let d = &v["match"]["Details"];
    assert_eq!(goals, d["HomeTeamScore"].as_u64().unwrap() + d["AwayTeamScore"].as_u64().unwrap());

    let bytes = serde_json::to_string(&resp).unwrap().len();
    assert!(bytes < 400_000, "whole response should be well under 0.4 MB, got {bytes} bytes");
}
