// crates/sim-core/src/lib.rs

pub mod config;
pub mod contract;
pub mod decider;
pub mod engine;
pub mod geom;
pub mod model;
pub mod roles;
pub mod tactics;
pub mod types;

pub use contract::{run_simulation, SimulateMatchRequest, SimulateMatchResponse};
pub use engine::MatchEngine;

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

/// C-ABI FFI function for Go or Node.js integration.
/// Accepts a UTF-8 JSON string of SimulateMatchRequest, runs the deterministic simulation,
/// and returns a dynamically allocated JSON string of SimulateMatchResponse.
#[unsafe(no_mangle)]
pub extern "C" fn simulate_match_ffi(req_json_ptr: *const c_char) -> *mut c_char {
    if req_json_ptr.is_null() {
        return std::ptr::null_mut();
    }

    let c_str = unsafe { CStr::from_ptr(req_json_ptr) };
    let json_slice = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    let req: SimulateMatchRequest = match serde_json::from_str(json_slice) {
        Ok(r) => r,
        Err(e) => {
            let err_resp = contract::SimulateMatchResponse {
                ok: false,
                fixtureId: "unknown".into(),
                match_data: None,
                metrics: contract::SimulationMetricsResponse { simulationMs: 0.0, totalMs: 0.0 },
                seed: None,
                error: Some(format!("Invalid request JSON: {}", e)),
            };
            let out_json = serde_json::to_string(&err_resp).unwrap_or_default();
            return CString::new(out_json).unwrap_or_default().into_raw();
        }
    };

    // A panic must not unwind across the C boundary (that aborts the host
    // process - the whole Go service). Report it as a failed simulation.
    let fixture_id = req.fixture_id.clone();
    let resp = std::panic::catch_unwind(|| run_simulation(req)).unwrap_or_else(|panic| {
        let msg = panic
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| panic.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".into());
        contract::SimulateMatchResponse {
            ok: false,
            fixtureId: fixture_id,
            match_data: None,
            metrics: contract::SimulationMetricsResponse { simulationMs: 0.0, totalMs: 0.0 },
            seed: None,
            error: Some(format!("simulation panicked: {msg}")),
        }
    });
    let out_json = serde_json::to_string(&resp).unwrap_or_default();
    // JSON never contains a NUL byte, so this cannot fail.
    CString::new(out_json).unwrap_or_default().into_raw()
}

/// Frees memory allocated by `simulate_match_ffi`.
#[unsafe(no_mangle)]
pub extern "C" fn free_match_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}
