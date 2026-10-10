// crates/sim-core/src/types.rs
//
// Core domain types, player attributes, match events, and replay structures.

use crate::geom::Vec2;
use crate::tactics::Trigger;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PositionCategory {
    GK,
    DEF,
    MID,
    ATT,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Attributes {
    pub speed: f32,
    pub shooting: f32,
    pub short_pass: f32,
    pub long_pass: f32,
    pub tackling: f32,
    pub keeping: f32,
    pub control: f32,
    pub strength: f32,
    pub stamina: f32,
    pub dribbling: f32,
    pub vision: f32,
    pub shot_power: f32,
    pub aggression: f32,
    pub interception: f32,
    pub marking: f32,
    pub agility: f32,
    pub crossing: f32,
    pub positioning: f32,
    pub long_shot: f32,
    /// Composure and decision-making.
    pub mental: f32,
    pub set_piece: f32,
}

impl Default for Attributes {
    fn default() -> Self {
        Self {
            speed: 50.0,
            shooting: 50.0,
            short_pass: 50.0,
            long_pass: 50.0,
            tackling: 50.0,
            keeping: 50.0,
            control: 50.0,
            strength: 50.0,
            stamina: 50.0,
            dribbling: 50.0,
            vision: 50.0,
            shot_power: 50.0,
            aggression: 50.0,
            interception: 50.0,
            marking: 50.0,
            agility: 50.0,
            crossing: 50.0,
            positioning: 50.0,
            long_shot: 50.0,
            mental: 50.0,
            set_piece: 50.0,
        }
    }
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CardState {
    None,
    Yellow,
    Red,
}

/// A nudge to a player's behavioural tendencies (`roles::PlayerTendencies`),
/// resolved once at build time from traits, synergies and abilities. All
/// fields are added onto the role's base tendency and clamped to 0..1.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct TendencyDelta {
    pub shoot: f32,
    pub dribble: f32,
    pub risk: f32,
    pub forward_runs: f32,
    pub press: f32,
    pub roam: f32,
}

impl TendencyDelta {
    pub const ZERO: TendencyDelta = TendencyDelta { shoot: 0.0, dribble: 0.0, risk: 0.0, forward_runs: 0.0, press: 0.0, roam: 0.0 };
    pub fn is_zero(&self) -> bool {
        *self == TendencyDelta::ZERO
    }
}

/// Bit tags for actions gated behind a player ability (`RawEffect` kind
/// `NewAction`). The decider only offers a tagged action when the carrier's
/// `PlayerEffects.actions` includes it.
pub mod action {
    /// Concede a foul on purpose to stop a transition (defensive action).
    pub const TACTICAL_FOUL: u16 = 1 << 0;
    /// Shoot first-time from a cross without settling the ball.
    pub const VOLLEY: u16 = 1 << 1;
    /// Long cross-field switch played with the outside of the boot.
    pub const TRIVELA: u16 = 1 << 2;
    /// A longer, more aggressive through ball into space behind the line.
    pub const THROUGH_BALL: u16 = 1 << 3;
    /// Keeper advances to sweep/claim.
    pub const SWEEPER_RUSH: u16 = 1 << 4;
}

/// A player's resolved effects: tendency deltas + unlocked actions + passive
/// modifiers. Built **once** from the request's `RawEffect`s (contract layer),
/// never recomputed per tick. All-zero means "behaves exactly like today".
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct PlayerEffects {
    pub tendency: TendencyDelta,
    /// Bit set of `action::*` unlocked for this player.
    pub actions: u16,
    /// Cross in-swing quality (added to a cross's completion log-odds).
    pub cross_inswing: f32,
    /// Extra aerial/header quality (blindside runs and near-post ability).
    pub header_bonus: f32,
    /// Log-odds bonus to cutting a pass out (reading the game).
    pub interception_bonus: f32,
    /// This defender reads passing lanes (a wider lane is contested).
    pub interception_lane: bool,
    /// Activate a stamina surge once when stamina first falls below this
    /// (0..100). 0 disables it.
    pub stamina_surge_below: f32,
    /// Stamina restored (0..100) when the surge fires.
    pub stamina_surge_amount: f32,
    /// Log-odds bonus to shot quality.
    pub shot_bonus: f32,
    /// The shot-quality bonus applies to first-time returns (volleys).
    pub shot_first_time: bool,
}

impl PlayerEffects {
    pub const NONE: PlayerEffects = PlayerEffects {
        tendency: TendencyDelta::ZERO,
        actions: 0,
        cross_inswing: 0.0,
        header_bonus: 0.0,
        interception_bonus: 0.0,
        interception_lane: false,
        stamina_surge_below: 0.0,
        stamina_surge_amount: 0.0,
        shot_bonus: 0.0,
        shot_first_time: false,
    };

    /// Whether the action tag is unlocked.
    #[inline]
    pub fn has(&self, tag: u16) -> bool {
        self.actions & tag != 0
    }

    /// Unlock an action tag.
    #[inline]
    pub fn unlock(&mut self, tag: u16) {
        self.actions |= tag;
    }

    /// True when this carries no effect at all (the parity case).
    #[inline]
    pub fn is_inert(&self) -> bool {
        *self == PlayerEffects::NONE
    }

    /// Merge a trigger-gated delta onto a base (03 §2.1 vector 3, OW-P03).
    /// Numeric modifiers add, booleans/actions OR, and a stamina surge keeps
    /// the stronger threshold/amount (a player rarely holds two surges).
    #[inline]
    pub fn combine(self, delta: PlayerEffects) -> PlayerEffects {
        PlayerEffects {
            tendency: TendencyDelta {
                shoot: self.tendency.shoot + delta.tendency.shoot,
                dribble: self.tendency.dribble + delta.tendency.dribble,
                risk: self.tendency.risk + delta.tendency.risk,
                forward_runs: self.tendency.forward_runs + delta.tendency.forward_runs,
                press: self.tendency.press + delta.tendency.press,
                roam: self.tendency.roam + delta.tendency.roam,
            },
            actions: self.actions | delta.actions,
            cross_inswing: self.cross_inswing + delta.cross_inswing,
            header_bonus: self.header_bonus + delta.header_bonus,
            interception_bonus: self.interception_bonus + delta.interception_bonus,
            interception_lane: self.interception_lane || delta.interception_lane,
            stamina_surge_below: self.stamina_surge_below.max(delta.stamina_surge_below),
            stamina_surge_amount: self.stamina_surge_amount.max(delta.stamina_surge_amount),
            shot_bonus: self.shot_bonus + delta.shot_bonus,
            shot_first_time: self.shot_first_time || delta.shot_first_time,
        }
    }
}

/// One trigger-gated effect (OW-P03): a `PlayerEffects` delta merged into the
/// player's active effects only while `trigger` matches at a tick boundary.
/// Resolved once at build time; an empty trigger list is the parity case.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ConditionalEffect {
    pub trigger: Trigger,
    pub effect: PlayerEffects,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimPlayer {
    pub id: String,
    pub name: String,
    pub position: PositionCategory,
    pub rating: f32,
    pub attributes: Attributes,
    pub pos: Vec2,
    pub target_pos: Vec2,
    pub anchor_pos: Vec2, // Base formation home anchor
    pub stamina: f32,      // 0.0 to 100.0 current stamina in match
    pub condition: f32,    // 0.0 to 100.0 overall fitness
    pub cards: CardState,
    pub is_sent_off: bool,
    pub team_index: usize, // 0 = Home, 1 = Away
    pub squad_index: usize, // 0..10
    pub shirt_number: String,
    /// Tactical role (from the squad Role + attributes) - its tendencies
    /// colour this player's decisions.
    pub role: crate::roles::PlayerRole,
    /// Multiplier on every skill this player uses (home advantage).
    pub boost: f32,
    /// Resolved traits/abilities: tendency nudges, unlocked actions, and
    /// passive modifiers. Default (all-zero) is behaviourally identical to
    /// the pre-abilities engine.
    #[serde(default)]
    pub effects: PlayerEffects,
    /// Trigger-gated effect deltas (OW-P03). `effects` holds the always-on
    /// base; `MatchEngine` moves these out at construction and re-merges the
    /// active ones into `effects` at each tick boundary. Empty is the parity
    /// case.
    #[serde(default)]
    pub conditional: Vec<ConditionalEffect>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BallFlightType {
    Ground,
    LowAir,
    HighAir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimBall {
    pub pos: Vec2,
    pub z: f32, // Height off ground (meters)
    pub velocity: Vec2,
    pub vz: f32,
    pub holder_idx: Option<usize>, // 0..21 active player index
    pub flight: Option<BallFlightType>,
    pub target_pos: Option<Vec2>,
    pub target_player_idx: Option<usize>,
}

impl Default for SimBall {
    fn default() -> Self {
        Self {
            pos: Vec2::new(0.5, 0.5),
            z: 0.0,
            velocity: Vec2::ZERO,
            vz: 0.0,
            holder_idx: None,
            flight: None,
            target_pos: None,
            target_player_idx: None,
        }
    }
}

/// What happened, recorded by the engine with squad indices only - the
/// contract layer turns these into the TypeScript `IMatchEvent` shape
/// (names, club codes, messages), keeping presentation out of the engine.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EventKind {
    KickOff,
    HalfTime,
    FullTime,
    Goal { penalty: bool },
    Save { penalty: bool },
    Miss { penalty: bool, blocked: bool },
    Foul { card: CardState, penalty: bool },
    /// A first-time shot without settling the ball (First-Time Volley ability).
    Volley,
    /// A cross-field switch played with the outside of the boot (Trivela ability).
    Trivela,
    /// A deliberate foul to break up a transition (Tactical Foul ability).
    TacticalFoul { card: CardState, penalty: bool },
    /// A manager order ("spell") activated by its trigger.
    OrderFired,
    /// A passive ability activated (stamina surge, interception, run...).
    AbilityFired,
}

#[derive(Debug, Clone)]
pub struct EngineEvent {
    pub tick: u16,
    pub minute: u8,
    pub kind: EventKind,
    /// The actor: scorer, saving keeper, shooter who missed, offender.
    pub player: Option<usize>,
    /// The other party: assister, shooter whose shot was saved, blocker,
    /// fouled player.
    pub other: Option<usize>,
    pub xg: Option<f32>,
    /// Team index for team-level events (orders) that have no actor player.
    pub team: Option<usize>,
    /// Free-text label for trigger events: the order kind or ability name.
    pub note: Option<String>,
}

/// Per-player match stats, mirroring the TypeScript engine's GameStats so
/// PlayerMatchDetails, MOTM and training growth keep working. `points`
/// uses the same weights as TS `GamePoints`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerMatchStats {
    pub goals: u16,
    pub assists: u16,
    pub saves: u16,
    pub shots: u16,
    /// Completed passes (the TS engine's `Passes` counted only these).
    pub passes: u16,
    pub tackles: u16,
    pub fouls: u16,
    pub yellow_cards: u8,
    pub red_cards: u8,
    pub dribbles: u16,
    pub interceptions: u16,
    /// 1 for the goalkeeper and defenders of a side that conceded nothing.
    pub clean_sheets: u8,
    pub points: f32,
}

/// TypeScript `IMatchEvent`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TsEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub message: String,
    /// Match minute, as a string - what TS consumers parse.
    pub time: String,
    #[serde(rename = "playerID", skip_serializing_if = "Option::is_none")]
    pub player_id: Option<String>,
    /// The acting player's club code (not id), as the TS engine sends it.
    #[serde(rename = "playerTeamID", skip_serializing_if = "Option::is_none")]
    pub player_team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Grid units per stored position integer (x 0-32, y 0-20).
pub const REPLAY_SCALE: f32 = 10.0;

/// Replay frames in the compact format the TS server stores and streams
/// (apps/fs-pro-server/src/realtime/packedFrames.ts - keep in step): the
/// roster once, positions as flat integer arrays, and status changes and
/// events only on the frames where they happen. ~40x smaller than an
/// object per player per frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackedFrames {
    pub format: String,
    pub scale: f32,
    pub roster: Vec<RosterEntry>,
    pub tick: Vec<u16>,
    pub minute: Vec<u8>,
    pub half: Vec<u8>,
    /// Ball per frame: x0, y0, x1, y1, ... (scaled).
    pub ball: Vec<i16>,
    /// Per frame, per roster slot: x, y (scaled).
    pub xy: Vec<i16>,
    /// Roster slot on the ball per frame, -1 for nobody.
    pub holder: Vec<i8>,
    /// (frame, slot, matchStatus, yellowCards, redCards) from that frame on;
    /// everyone starts active with no cards.
    pub status: Vec<(u32, u8, String, u8, u8)>,
    pub events: Vec<(u32, TsEvent)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RosterEntry {
    pub id: String,
    pub side: String,
    pub num: String,
    pub pos: String,
}

/// What the engine records per tick; the contract layer adds the roster
/// and events to make `PackedFrames`.
#[derive(Debug, Clone, Default)]
pub struct ReplayBuffer {
    pub tick: Vec<u16>,
    pub minute: Vec<u8>,
    pub half: Vec<u8>,
    pub ball: Vec<i16>,
    pub xy: Vec<i16>,
    pub holder: Vec<i8>,
    pub status: Vec<(u32, u8, String, u8, u8)>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TeamMatchStats {
    pub score: u8,
    pub shots: u16,
    pub shots_on_target: u16,
    pub passes: u16,
    pub passes_completed: u16,
    pub tackles: u16,
    pub fouls: u16,
    pub yellow_cards: u8,
    pub red_cards: u8,
    pub possession_ticks: u32,
    pub xg: f32,
}
