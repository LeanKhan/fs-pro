// crates/sim-core/src/bin/sim_cli.rs
//
// One match per process: a SimulateMatchRequest JSON on stdin (or a file
// path argument), the SimulateMatchResponse JSON on stdout. The Go service
// uses this on platforms where it doesn't load the library in-process.

use sim_core::contract::{run_simulation, SimulateMatchRequest, SimulateMatchResponse, SimulationMetricsResponse};
use std::env;
use std::fs;
use std::io::{self, Read};

fn main() {
    let args: Vec<String> = env::args().collect();

    let json_input = if args.len() > 1 && args[1] != "-" {
        fs::read_to_string(&args[1]).expect("Failed to read input JSON file")
    } else {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer).expect("Failed to read stdin");
        buffer
    };

    let resp = match serde_json::from_str::<SimulateMatchRequest>(&json_input) {
        Ok(req) => run_simulation(req),
        // Same shape as the FFI's error reply, so callers handle one format.
        Err(e) => SimulateMatchResponse {
            ok: false,
            fixtureId: "unknown".into(),
            match_data: None,
            metrics: SimulationMetricsResponse { simulationMs: 0.0, totalMs: 0.0 },
            seed: None,
            error: Some(format!("Invalid request JSON: {e}")),
        },
    };

    // Compact: pretty-printing the replay's position arrays triples the size.
    println!("{}", serde_json::to_string(&resp).expect("Failed to serialize response"));
}
