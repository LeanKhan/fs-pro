// crates/sim-core/src/tactics.rs
//
// Dynamic tactical formations, team styles, defensive lines, and spatial anchors.
// Fully configurable from database/user inputs.

use crate::geom::Vec2;
use crate::types::PositionCategory;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormationSlot {
    pub position: PositionCategory,
    pub anchor: Vec2, // x: 0.0 (own goal) -> 1.0 (opp goal), y: 0.0 (left touchline) -> 1.0 (right touchline)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamTactics {
    pub formation_name: String,
    pub style_name: String,
    pub pressing_intensity: f32,    // 0.0 to 1.0
    pub defensive_line_height: f32, // 0.0 (low block) to 1.0 (high line)
    pub width: f32,                 // 0.0 (narrow) to 1.0 (wide)
    pub tempo: f32,                 // 0.0 (patient) to 1.0 (fast)
    pub directness: f32,            // 0.0 (possession/short) to 1.0 (direct/long)
    pub positional_discipline: f32, // 0.0 (fluid) to 1.0 (rigid)
    pub slots: [FormationSlot; 11],
}

impl Default for TeamTactics {
    fn default() -> Self {
        Self {
            formation_name: "433".to_string(),
            style_name: "Balanced".to_string(),
            pressing_intensity: 0.50,
            defensive_line_height: 0.50,
            width: 0.60,
            tempo: 0.50,
            directness: 0.50,
            positional_discipline: 0.50,
            slots: get_formation_anchors("433"),
        }
    }
}

impl TeamTactics {
    /// Creates a dynamic TeamTactics instance from style name, custom sliders, and formation name.
    pub fn new(
        formation_name: &str,
        style_name: Option<&str>,
        pressing: Option<f32>,
        def_line: Option<f32>,
        width: Option<f32>,
        tempo: Option<f32>,
        directness: Option<f32>,
        discipline: Option<f32>,
        custom_slots: Option<Vec<FormationSlot>>,
    ) -> Self {
        let style = style_name.unwrap_or("Balanced");
        let (mut def_p, mut def_l, mut def_w, mut def_t, mut def_dir, mut def_disc) = match_style_defaults(style);

        // Dynamic overrides from user/database
        if let Some(p) = pressing {
            def_p = if p > 1.0 { (p / 5.0).clamp(0.1, 1.0) } else { p.clamp(0.0, 1.0) };
        }
        if let Some(l) = def_line {
            def_l = l.clamp(0.0, 1.0);
        }
        if let Some(w) = width {
            def_w = w.clamp(0.0, 1.0);
        }
        if let Some(t) = tempo {
            def_t = t.clamp(0.0, 1.0);
        }
        if let Some(d) = directness {
            def_dir = d.clamp(0.0, 1.0);
        }
        if let Some(disc) = discipline {
            def_disc = disc.clamp(0.0, 1.0);
        }

        let slots = if let Some(cs) = custom_slots {
            if cs.len() == 11 {
                let mut arr = get_formation_anchors(formation_name);
                for (i, slot) in cs.into_iter().enumerate() {
                    arr[i] = slot;
                }
                arr
            } else {
                get_formation_anchors(formation_name)
            }
        } else {
            get_formation_anchors(formation_name)
        };

        Self {
            formation_name: formation_name.to_string(),
            style_name: style.to_string(),
            pressing_intensity: def_p,
            defensive_line_height: def_l,
            width: def_w,
            tempo: def_t,
            directness: def_dir,
            positional_discipline: def_disc,
            slots,
        }
    }
}

/// The style matchup (docs/CORE-LOOP.md, "Match prep"): +1 when `own`
/// counters `opp`, -1 when it is countered, 0 otherwise. A cycle - High
/// Press > Possession > Low Block > Direct > High Press - with Balanced
/// neutral against everything, so every plan has an answer.
pub fn style_matchup(own: &str, opp: &str) -> f32 {
    let key = |s: &str| s.replace([' ', '_', '-'], "").to_lowercase();
    const CYCLE: [&str; 4] = ["highpress", "possession", "lowblock", "direct"];
    let (Some(a), Some(b)) = (CYCLE.iter().position(|s| *s == key(own)), CYCLE.iter().position(|s| *s == key(opp))) else {
        return 0.0;
    };
    if (a + 1) % 4 == b {
        1.0
    } else if (b + 1) % 4 == a {
        -1.0
    } else {
        0.0
    }
}

/// The formation matchup: no shape beats every other. 3-5-2's midfield
/// overload wins the middle but its back three is exposed by two-striker and
/// wide shapes (4-4-2, 4-3-3); 4-3-3's front three beats 4-4-2's flat four;
/// 4-2-3-1's double pivot smothers 4-3-3's midfield. Returns +1 when `own`
/// counters `opp`, -1 when countered, 0 otherwise.
pub fn formation_matchup(own: &str, opp: &str) -> f32 {
    let key = |s: &str| s.replace([' ', '-', '_'], "").to_lowercase();
    let (o, p) = (key(own), key(opp));
    let beats = |a: &str, b: &str| -> i32 {
        ((o == a && p == b) as i32) - ((o == b && p == a) as i32)
    };
    let mut e = 0i32;
    e += beats("442", "352");
    e += beats("433", "352");
    e += beats("352", "4231");
    e += beats("4231", "433");
    e += beats("433", "442");
    e.signum() as f32
}

fn match_style_defaults(style_name: &str) -> (f32, f32, f32, f32, f32, f32) {
    let clean = style_name.replace([' ', '_', '-'], "").to_lowercase();
    match clean.as_str() {
        "highpress" => (0.72, 0.80, 0.55, 0.70, 0.50, 0.30),
        "lowblock" => (0.40, 0.28, 0.50, 0.35, 0.60, 0.85),
        "possession" => (0.50, 0.55, 0.70, 0.40, 0.25, 0.60),
        "direct" => (0.65, 0.45, 0.50, 0.80, 0.85, 0.40),
        _ => (0.50, 0.50, 0.60, 0.50, 0.50, 0.50), // Balanced
    }
}

/// Resolves formation anchors dynamically for canonical shapes or arbitrary formation codes.
pub fn get_formation_anchors(formation_name: &str) -> [FormationSlot; 11] {
    let clean = formation_name.replace([' ', '-', '_'], "").to_lowercase();
    match clean.as_str() {
        "442" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.15) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.38) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.62) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.85) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.75, 0.38) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.75, 0.62) },
        ],
        "4231" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.38, 0.35) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.38, 0.65) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.58, 0.18) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.58, 0.50) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.58, 0.82) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
        ],
        "352" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.25) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.50) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.75) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.10) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.42, 0.35) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.42, 0.65) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.90) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.58, 0.50) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.38) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.62) },
        ],
        "343" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.25) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.50) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.75) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.12) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.38) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.62) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.88) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.18) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.82) },
        ],
        "532" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.10) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.30) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.50) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.70) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.90) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.30) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.50) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.70) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.38) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.62) },
        ],
        "541" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.10) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.30) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.50) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.70) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.90) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.15) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.38) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.62) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.85) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
        ],
        "4141" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.33, 0.50) }, // CDM
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.50, 0.15) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.50, 0.38) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.50, 0.62) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.50, 0.85) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
        ],
        "451" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.12) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.30) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.50) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.70) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.88) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
        ],
        "41212" | "4312" => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.35, 0.50) }, // CDM
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.48, 0.30) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.48, 0.70) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.60, 0.50) }, // CAM
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.38) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.76, 0.62) },
        ],
        // Default: 4-3-3
        _ => [
            FormationSlot { position: PositionCategory::GK, anchor: Vec2::new(0.04, 0.5) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.15) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.38) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.62) },
            FormationSlot { position: PositionCategory::DEF, anchor: Vec2::new(0.18, 0.85) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.30) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.42, 0.50) },
            FormationSlot { position: PositionCategory::MID, anchor: Vec2::new(0.45, 0.70) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.75, 0.18) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.78, 0.50) },
            FormationSlot { position: PositionCategory::ATT, anchor: Vec2::new(0.75, 0.82) },
        ],
    }
}

/// Computes the adjusted dynamic tactical anchor based on ball position, match phase, and tactical instructions.
pub fn compute_dynamic_anchor(
    slot: &FormationSlot,
    is_home_attacking_left_to_right: bool,
    ball_pos: Vec2,
    has_possession: bool,
    tactics: &TeamTactics,
) -> Vec2 {
    let mut base = slot.anchor;

    // Apply defensive line height dynamically (0.0 = low block to 1.0 = high line)
    let line_shift = (tactics.defensive_line_height - 0.5) * 0.14;
    if slot.position != PositionCategory::GK {
        base.x = (base.x + line_shift).clamp(0.08, 0.92);
    }

    // Apply width dynamically to flank players
    if base.y < 0.35 || base.y > 0.65 {
        let width_mult = 0.7 + tactics.width * 0.6; // 0.7 to 1.3
        let dy = base.y - 0.5;
        base.y = (0.5 + dy * width_mult).clamp(0.04, 0.96);
    }

    // Dynamic line advance when in possession
    if has_possession {
        if slot.position == PositionCategory::ATT {
            base.x = (base.x + 0.10).clamp(0.10, 0.90);
        } else if slot.position == PositionCategory::MID {
            base.x = (base.x + 0.05).clamp(0.10, 0.80);
        }
    }

    // Dynamic shift towards the ball (compactness), scaled by positional discipline
    let fluid_factor = (1.2 - tactics.positional_discipline * 0.4).clamp(0.75, 1.25);
    let ball_shift_factor = (if has_possession { 0.25 } else { 0.35 }) * fluid_factor;
    let ball_x_norm = if is_home_attacking_left_to_right { ball_pos.x } else { 1.0 - ball_pos.x };
    let ball_dx = (ball_x_norm - base.x) * ball_shift_factor;
    let ball_dy = (ball_pos.y - base.y) * 0.15;

    let mut adjusted = Vec2 {
        x: (base.x + ball_dx).clamp(0.02, 0.96),
        y: (base.y + ball_dy).clamp(0.04, 0.96),
    };

    if !is_home_attacking_left_to_right {
        adjusted.x = 1.0 - adjusted.x;
    }

    adjusted
}
