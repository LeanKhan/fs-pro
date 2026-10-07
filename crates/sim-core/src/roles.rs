// crates/sim-core/src/roles.rs
//
// Tactical Player Roles & Tendencies.
// Dictates individual behavioral weights and utility adjustments on the pitch.

use crate::types::{Attributes, PositionCategory};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PlayerRole {
    // Goalkeepers
    TraditionalKeeper,
    SweeperKeeper,
    // Defenders
    NoNonsenseCentreBack,
    BallPlayingDefender,
    FullBack,
    WingBack,
    InvertedWingBack,
    // Midfielders
    BallWinningMidfielder,
    DeepLyingPlaymaker,
    BoxToBox,
    AdvancedPlaymaker,
    Winger,
    InvertedWinger,
    // Attackers
    Poacher,
    TargetMan,
    AdvancedForward,
    FalseNine,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerTendencies {
    pub shoot_bias: f32,       // Multiplier on shoot utility
    pub direct_pass_bias: f32, // Prefers forward vertical passes over safe backwards passes
    pub dribble_bias: f32,     // Tendency to take on defenders 1v1
    pub risk_appetite: f32,    // Tolerance for contested passing lanes (0.0 safe, 1.0 ambitious)
    pub roaming_freedom: f32,  // Distance allowed from tactical formation anchor
    pub forward_runs: f32,     // Frequency of making off-ball penetration runs
    pub pressing_effort: f32,  // Proactivity in closing down the ball carrier
}

impl PlayerRole {
    pub fn default_for(pos: PositionCategory) -> Self {
        match pos {
            PositionCategory::GK => PlayerRole::TraditionalKeeper,
            PositionCategory::DEF => PlayerRole::BallPlayingDefender,
            PositionCategory::MID => PlayerRole::BoxToBox,
            PositionCategory::ATT => PlayerRole::AdvancedForward,
        }
    }

    /// The role a player actually plays: the squad Role (LB, CDM, ST, ...)
    /// picks the family, attributes pick the variant - a centre-back who
    /// passes better than he defends is a ball-playing defender.
    pub fn from_squad_role(role: Option<&str>, pos: PositionCategory, a: &Attributes) -> Self {
        let avg = |xs: &[f32]| xs.iter().sum::<f32>() / xs.len() as f32;
        match role.unwrap_or("") {
            "GK" => {
                if avg(&[a.speed, a.short_pass, a.control]) > 62.0 { PlayerRole::SweeperKeeper } else { PlayerRole::TraditionalKeeper }
            }
            "CB" => {
                if avg(&[a.short_pass, a.long_pass, a.vision]) > avg(&[a.tackling, a.strength, a.marking]) {
                    PlayerRole::BallPlayingDefender
                } else {
                    PlayerRole::NoNonsenseCentreBack
                }
            }
            "LB" | "RB" => {
                if avg(&[a.speed, a.crossing, a.stamina]) > 65.0 { PlayerRole::WingBack } else { PlayerRole::FullBack }
            }
            "LWB" | "RWB" => PlayerRole::WingBack,
            "CDM" => {
                if a.tackling >= a.vision { PlayerRole::BallWinningMidfielder } else { PlayerRole::DeepLyingPlaymaker }
            }
            "CM" => {
                if avg(&[a.vision, a.long_pass]) > avg(&[a.stamina, a.tackling]) + 5.0 {
                    PlayerRole::DeepLyingPlaymaker
                } else {
                    PlayerRole::BoxToBox
                }
            }
            "CAM" => PlayerRole::AdvancedPlaymaker,
            "LM" | "RM" => PlayerRole::Winger,
            "LW" | "RW" => {
                if a.crossing >= a.dribbling { PlayerRole::Winger } else { PlayerRole::InvertedWinger }
            }
            "ST" | "CF" => {
                if a.shooting >= a.strength && a.shooting >= a.vision {
                    if a.speed > 70.0 { PlayerRole::AdvancedForward } else { PlayerRole::Poacher }
                } else if a.strength > a.vision {
                    PlayerRole::TargetMan
                } else {
                    PlayerRole::FalseNine
                }
            }
            _ => Self::default_for(pos),
        }
    }

    pub fn tendencies(&self) -> PlayerTendencies {
        match self {
            PlayerRole::TraditionalKeeper => PlayerTendencies {
                shoot_bias: 0.0,
                direct_pass_bias: 0.8,
                dribble_bias: 0.05,
                risk_appetite: 0.1,
                roaming_freedom: 0.1,
                forward_runs: 0.0,
                pressing_effort: 0.2,
            },
            PlayerRole::SweeperKeeper => PlayerTendencies {
                shoot_bias: 0.0,
                direct_pass_bias: 0.5,
                dribble_bias: 0.15,
                risk_appetite: 0.35,
                roaming_freedom: 0.4,
                forward_runs: 0.0,
                pressing_effort: 0.6,
            },
            PlayerRole::NoNonsenseCentreBack => PlayerTendencies {
                shoot_bias: 0.1,
                direct_pass_bias: 0.7,
                dribble_bias: 0.1,
                risk_appetite: 0.15,
                roaming_freedom: 0.2,
                forward_runs: 0.05,
                pressing_effort: 0.7,
            },
            PlayerRole::BallPlayingDefender => PlayerTendencies {
                shoot_bias: 0.15,
                direct_pass_bias: 0.6,
                dribble_bias: 0.3,
                risk_appetite: 0.45,
                roaming_freedom: 0.35,
                forward_runs: 0.15,
                pressing_effort: 0.65,
            },
            PlayerRole::FullBack => PlayerTendencies {
                shoot_bias: 0.3,
                direct_pass_bias: 0.5,
                dribble_bias: 0.45,
                risk_appetite: 0.4,
                roaming_freedom: 0.5,
                forward_runs: 0.5,
                pressing_effort: 0.7,
            },
            PlayerRole::WingBack => PlayerTendencies {
                shoot_bias: 0.45,
                direct_pass_bias: 0.55,
                dribble_bias: 0.65,
                risk_appetite: 0.6,
                roaming_freedom: 0.7,
                forward_runs: 0.85,
                pressing_effort: 0.8,
            },
            PlayerRole::InvertedWingBack => PlayerTendencies {
                shoot_bias: 0.4,
                direct_pass_bias: 0.6,
                dribble_bias: 0.5,
                risk_appetite: 0.5,
                roaming_freedom: 0.6,
                forward_runs: 0.6,
                pressing_effort: 0.75,
            },
            PlayerRole::BallWinningMidfielder => PlayerTendencies {
                shoot_bias: 0.3,
                direct_pass_bias: 0.4,
                dribble_bias: 0.25,
                risk_appetite: 0.25,
                roaming_freedom: 0.45,
                forward_runs: 0.3,
                pressing_effort: 0.95,
            },
            PlayerRole::DeepLyingPlaymaker => PlayerTendencies {
                shoot_bias: 0.35,
                direct_pass_bias: 0.7,
                dribble_bias: 0.35,
                risk_appetite: 0.7,
                roaming_freedom: 0.5,
                forward_runs: 0.2,
                pressing_effort: 0.5,
            },
            PlayerRole::BoxToBox => PlayerTendencies {
                shoot_bias: 0.6,
                direct_pass_bias: 0.55,
                dribble_bias: 0.55,
                risk_appetite: 0.5,
                roaming_freedom: 0.7,
                forward_runs: 0.75,
                pressing_effort: 0.85,
            },
            PlayerRole::AdvancedPlaymaker => PlayerTendencies {
                shoot_bias: 0.55,
                direct_pass_bias: 0.8,
                dribble_bias: 0.6,
                risk_appetite: 0.75,
                roaming_freedom: 0.8,
                forward_runs: 0.65,
                pressing_effort: 0.5,
            },
            PlayerRole::Winger => PlayerTendencies {
                shoot_bias: 0.6,
                direct_pass_bias: 0.65,
                dribble_bias: 0.85,
                risk_appetite: 0.7,
                roaming_freedom: 0.7,
                forward_runs: 0.9,
                pressing_effort: 0.6,
            },
            PlayerRole::InvertedWinger => PlayerTendencies {
                shoot_bias: 0.8,
                direct_pass_bias: 0.6,
                dribble_bias: 0.8,
                risk_appetite: 0.7,
                roaming_freedom: 0.75,
                forward_runs: 0.85,
                pressing_effort: 0.6,
            },
            PlayerRole::Poacher => PlayerTendencies {
                shoot_bias: 0.95,
                direct_pass_bias: 0.3,
                dribble_bias: 0.4,
                risk_appetite: 0.5,
                roaming_freedom: 0.3,
                forward_runs: 0.95,
                pressing_effort: 0.55,
            },
            PlayerRole::TargetMan => PlayerTendencies {
                shoot_bias: 0.75,
                direct_pass_bias: 0.6,
                dribble_bias: 0.3,
                risk_appetite: 0.4,
                roaming_freedom: 0.4,
                forward_runs: 0.5,
                pressing_effort: 0.7,
            },
            PlayerRole::AdvancedForward => PlayerTendencies {
                shoot_bias: 0.85,
                direct_pass_bias: 0.6,
                dribble_bias: 0.7,
                risk_appetite: 0.65,
                roaming_freedom: 0.7,
                forward_runs: 0.9,
                pressing_effort: 0.75,
            },
            PlayerRole::FalseNine => PlayerTendencies {
                shoot_bias: 0.65,
                direct_pass_bias: 0.75,
                dribble_bias: 0.65,
                risk_appetite: 0.65,
                roaming_freedom: 0.85,
                forward_runs: 0.5,
                pressing_effort: 0.7,
            },
        }
    }
}
