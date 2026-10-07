// crates/sim-core/src/contract.rs
//
// Shared I/O Contract matching TypeScript's SimulateMatchRequest & SimulateMatchResult.
#![allow(non_snake_case)]

use crate::engine::MatchEngine;
use crate::geom::Vec2;
use crate::roles::PlayerRole;
use crate::tactics::{FormationSlot, TeamTactics};
use crate::types::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawAttributes {
    #[serde(alias = "speed", alias = "Speed")]
    pub Speed: Option<f32>,
    #[serde(alias = "shooting", alias = "Shooting")]
    pub Shooting: Option<f32>,
    #[serde(alias = "shortPass", alias = "ShortPass", alias = "short_pass")]
    pub ShortPass: Option<f32>,
    #[serde(alias = "longPass", alias = "LongPass", alias = "long_pass")]
    pub LongPass: Option<f32>,
    #[serde(alias = "tackling", alias = "Tackling")]
    pub Tackling: Option<f32>,
    #[serde(alias = "keeping", alias = "Keeping")]
    pub Keeping: Option<f32>,
    #[serde(alias = "control", alias = "Control")]
    pub Control: Option<f32>,
    #[serde(alias = "strength", alias = "Strength")]
    pub Strength: Option<f32>,
    #[serde(alias = "stamina", alias = "Stamina")]
    pub Stamina: Option<f32>,
    #[serde(alias = "dribbling", alias = "Dribbling")]
    pub Dribbling: Option<f32>,
    #[serde(alias = "vision", alias = "Vision")]
    pub Vision: Option<f32>,
    #[serde(alias = "shotPower", alias = "ShotPower", alias = "shot_power")]
    pub ShotPower: Option<f32>,
    #[serde(alias = "aggression", alias = "Aggression")]
    pub Aggression: Option<f32>,
    #[serde(alias = "interception", alias = "Interception")]
    pub Interception: Option<f32>,
    #[serde(alias = "marking", alias = "Marking")]
    pub Marking: Option<f32>,
    #[serde(alias = "agility", alias = "Agility")]
    pub Agility: Option<f32>,
    #[serde(alias = "crossing", alias = "Crossing")]
    pub Crossing: Option<f32>,
    #[serde(alias = "positioning", alias = "Positioning")]
    pub Positioning: Option<f32>,
    #[serde(alias = "longShot", alias = "LongShot", alias = "long_shot")]
    pub LongShot: Option<f32>,
    #[serde(alias = "mental", alias = "Mental", default)]
    pub Mental: Option<f32>,
    #[serde(alias = "setPiece", alias = "SetPiece", alias = "set_piece", default)]
    pub SetPiece: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawPlayer {
    #[serde(alias = "_id", alias = "id")]
    pub id: Option<String>,
    #[serde(alias = "name")]
    pub Name: Option<String>,
    #[serde(alias = "FirstName")]
    pub first_name: Option<String>,
    #[serde(alias = "LastName")]
    pub last_name: Option<String>,
    #[serde(alias = "Position")]
    pub position: Option<String>,
    #[serde(alias = "Rating")]
    pub rating: Option<f32>,
    #[serde(alias = "Attributes")]
    pub attributes: Option<RawAttributes>,
    #[serde(alias = "Stamina")]
    pub stamina: Option<f32>,
    #[serde(alias = "Fitness")]
    pub fitness: Option<f32>,
    #[serde(alias = "ShirtNumber", default, deserialize_with = "string_or_number")]
    pub shirt_number: Option<String>,
    /// Squad role (LB, CB, RW, ...) - puts the player on the right flank of
    /// their formation line.
    #[serde(alias = "Role")]
    pub role: Option<String>,
    /// `{ type, daysRemaining }` or null.
    #[serde(alias = "Injury", default)]
    pub injury: Option<serde_json::Value>,
}

/// Accepts a JSON string, number or null (shirt numbers arrive as either).
fn string_or_number<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Ok(match Option::<serde_json::Value>::deserialize(d)? {
        Some(serde_json::Value::String(s)) => Some(s),
        Some(serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    })
}

impl RawPlayer {
    fn is_injured(&self) -> bool {
        self.injury
            .as_ref()
            .and_then(|i| i.get("daysRemaining"))
            .and_then(|d| d.as_f64())
            .is_some_and(|d| d > 0.0)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawLineup {
    #[serde(alias = "startingXI", default)]
    pub starting_xi: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawClub {
    #[serde(alias = "_id", alias = "id")]
    pub id: Option<String>,
    #[serde(alias = "Name")]
    pub name: Option<String>,
    #[serde(alias = "ClubCode")]
    pub code: Option<String>,
    #[serde(alias = "ManagerId")]
    pub manager_id: Option<String>,
    /// The whole squad (`Players` in the TS request) - the XI is picked
    /// from it by `select_starting_xi`.
    #[serde(alias = "Players", alias = "StartingLineup")]
    pub players: Option<Vec<RawPlayer>>,
    /// The manager's chosen starters, honoured first when present.
    #[serde(alias = "Lineup", default)]
    pub lineup: Option<RawLineup>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawFormationSlot {
    #[serde(alias = "Position", alias = "positions")]
    pub position: Option<serde_json::Value>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawTactic {
    #[serde(alias = "formationName", alias = "Formation")]
    pub formation_name: Option<String>,
    #[serde(alias = "styleName", alias = "Style")]
    pub style_name: Option<String>,
    #[serde(alias = "pressingIntensity")]
    pub pressing_intensity: Option<f32>,
    #[serde(alias = "defensiveLineHeight")]
    pub defensive_line_height: Option<f32>,
    #[serde(alias = "width")]
    pub width: Option<f32>,
    #[serde(alias = "tempo")]
    pub tempo: Option<f32>,
    #[serde(alias = "directness")]
    pub directness: Option<f32>,
    #[serde(alias = "positionalDiscipline")]
    pub positional_discipline: Option<f32>,
    #[serde(alias = "slots", alias = "customSlots")]
    pub slots: Option<Vec<RawFormationSlot>>,
    /// Conditional orders for the second half (see engine::HalfTimeOrders).
    #[serde(alias = "halfTime", default)]
    pub half_time: Option<RawHalfTime>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RawHalfTime {
    #[serde(default)]
    pub losing: Option<String>,
    #[serde(default)]
    pub drawing: Option<String>,
    #[serde(default)]
    pub winning: Option<String>,
}

impl RawTactic {
    pub fn simple(formation: &str, style: &str) -> Self {
        Self {
            formation_name: Some(formation.to_string()),
            style_name: Some(style.to_string()),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSides {
    pub home: String,
    pub away: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawTactics {
    pub home: Option<RawTactic>,
    pub away: Option<RawTactic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulateMatchRequest {
    #[serde(alias = "fixtureId")]
    pub fixture_id: String,
    pub clubs: Vec<RawClub>,
    pub sides: RawSides,
    pub tactics: Option<RawTactics>,
    /// Reproduces one specific run when given (tests, bug reports).
    /// Omitted means a fresh random seed: playing the same fixture again
    /// is a new match. The seed actually used is echoed in the response.
    pub seed: Option<String>,
    /// Record per-tick replay frames (default true). Off for matches nobody
    /// will watch - frames are most of the response size.
    #[serde(alias = "includeFrames", default)]
    pub include_frames: Option<bool>,
}

// ---------------------------------------------------------------------
// Response - the TypeScript `SimulatedMatchData` shape (jobs/
// simulationContract.ts + simulation/classes/Match.ts), so play() and
// updateFixture() consume it exactly like the in-process engine's output.
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchSummaryTeam {
    pub _id: String,
    pub Name: String,
    pub ClubCode: String,
    pub ManagerId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClubRef {
    pub code: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Motm {
    pub id: String,
    pub name: String,
    pub clubcode: String,
    pub points: f32,
}

/// TS `PlayerMatchDetailsInterface` (the fields the engine produces).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStatsRow {
    pub PlayerId: String,
    pub Goals: u16,
    pub Assists: u16,
    pub Saves: u16,
    pub Shots: u16,
    pub Passes: u16,
    pub Tackles: u16,
    pub Fouls: u16,
    pub YellowCards: u8,
    pub RedCards: u8,
    pub Dribbles: u16,
    pub Interceptions: u16,
    pub CleanSheets: u8,
    pub Points: f32,
}

/// TS `IMatchSideDetails`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SideDetails {
    pub ClubId: String,
    pub FixtureId: String,
    pub TimesWithBall: u32,
    pub Possession: f32,
    pub Goals: u8,
    pub TotalShots: u16,
    pub ShotsOnTarget: u16,
    pub ShotsOffTarget: u16,
    pub Fouls: u16,
    pub YellowCards: u8,
    pub RedCards: u8,
    /// Completed passes, as the TS engine counted them.
    pub Passes: u16,
    pub PassesAttempted: u16,
    pub Tackles: u16,
    pub XG: f32,
    pub Events: Vec<TsEvent>,
    pub PlayerStats: Vec<PlayerStatsRow>,
    pub Won: bool,
    pub Drew: bool,
}

/// TS `IMatchDetails`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDetailsResponse {
    pub Title: String,
    pub LeagueName: String,
    pub Draw: bool,
    pub Played: bool,
    pub FirstHalfScore: String,
    pub FullTimeScore: String,
    pub HomeTeamScore: u8,
    pub AwayTeamScore: u8,
    pub Winner: Option<ClubRef>,
    pub Loser: Option<ClubRef>,
    pub MOTM: Option<Motm>,
    pub TotalPasses: u16,
    /// Total goals in the match (a number, as in TS).
    pub Goals: u16,
    pub HomeTeamDetails: SideDetails,
    pub AwayTeamDetails: SideDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchSimulatedData {
    pub Home: MatchSummaryTeam,
    pub Away: MatchSummaryTeam,
    pub Details: MatchDetailsResponse,
    pub Events: Vec<TsEvent>,
    pub Frames: PackedFrames,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationMetricsResponse {
    pub simulationMs: f64,
    pub totalMs: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulateMatchResponse {
    pub ok: bool,
    pub fixtureId: String,
    /// Serialized as `match` - the key the TS worker and the Go stream read.
    #[serde(rename = "match")]
    pub match_data: Option<MatchSimulatedData>,
    pub metrics: SimulationMetricsResponse,
    /// The seed this run used - pass it back as `seed` to reproduce it.
    pub seed: Option<String>,
    pub error: Option<String>,
}

fn parse_attributes(raw: Option<RawAttributes>, fallback_rating: f32) -> Attributes {
    let r = raw.unwrap_or(RawAttributes {
        Speed: None,
        Shooting: None,
        ShortPass: None,
        LongPass: None,
        Tackling: None,
        Keeping: None,
        Control: None,
        Strength: None,
        Stamina: None,
        Dribbling: None,
        Vision: None,
        ShotPower: None,
        Aggression: None,
        Interception: None,
        Marking: None,
        Agility: None,
        Crossing: None,
        Positioning: None,
        LongShot: None,
        Mental: None,
        SetPiece: None,
    });

    let fb = fallback_rating.clamp(1.0, 99.0);

    Attributes {
        speed: r.Speed.unwrap_or(fb),
        shooting: r.Shooting.unwrap_or(fb),
        short_pass: r.ShortPass.unwrap_or(fb),
        long_pass: r.LongPass.unwrap_or(fb),
        tackling: r.Tackling.unwrap_or(fb),
        keeping: r.Keeping.unwrap_or(fb),
        control: r.Control.unwrap_or(fb),
        strength: r.Strength.unwrap_or(fb),
        stamina: r.Stamina.unwrap_or(fb),
        dribbling: r.Dribbling.unwrap_or(fb),
        vision: r.Vision.unwrap_or(fb),
        shot_power: r.ShotPower.unwrap_or(fb),
        aggression: r.Aggression.unwrap_or(fb),
        interception: r.Interception.unwrap_or(fb),
        marking: r.Marking.unwrap_or(fb),
        agility: r.Agility.unwrap_or(fb),
        crossing: r.Crossing.unwrap_or(fb),
        positioning: r.Positioning.unwrap_or(fb),
        long_shot: r.LongShot.unwrap_or(fb),
        mental: r.Mental.unwrap_or(fb),
        set_piece: r.SetPiece.unwrap_or(fb),
    }
}

fn parse_position(pos: Option<&str>) -> PositionCategory {
    match pos.unwrap_or("MID") {
        "GK" => PositionCategory::GK,
        "DEF" | "DF" | "CB" | "LB" | "RB" => PositionCategory::DEF,
        "MID" | "MF" | "CM" | "DM" | "AM" | "LM" | "RM" => PositionCategory::MID,
        "ATT" | "FW" | "ST" | "CF" | "LW" | "RW" => PositionCategory::ATT,
        _ => PositionCategory::MID,
    }
}

fn parse_formation_slot(raw: &RawFormationSlot) -> FormationSlot {
    let pos_str = match &raw.position {
        Some(serde_json::Value::String(s)) => s.as_str(),
        Some(serde_json::Value::Array(arr)) => arr.first().and_then(|v| v.as_str()).unwrap_or("MID"),
        _ => "MID",
    };
    let position = parse_position(Some(pos_str));
    let mut x = raw.x.unwrap_or(0.5);
    let mut y = raw.y.unwrap_or(0.5);
    if x > 1.0 {
        x = (x / 32.0).clamp(0.0, 1.0);
    }
    if y > 1.0 {
        y = (y / 20.0).clamp(0.0, 1.0);
    }
    FormationSlot {
        position,
        anchor: Vec2::new(x, y),
    }
}

fn build_tactics(raw: Option<&RawTactic>) -> TeamTactics {
    let t = match raw {
        Some(t) => t,
        None => return TeamTactics::default(),
    };

    let custom_slots = t.slots.as_ref().map(|slots| {
        slots.iter().map(parse_formation_slot).collect::<Vec<_>>()
    });

    TeamTactics::new(
        t.formation_name.as_deref().unwrap_or("433"),
        t.style_name.as_deref(),
        t.pressing_intensity,
        t.defensive_line_height,
        t.width,
        t.tempo,
        t.directness,
        t.positional_discipline,
        custom_slots,
    )
}

/// Seed string -> RNG seed, with stable 64-bit FNV-1a. Unlike std's
/// `DefaultHasher` (algorithm unspecified, may change between Rust
/// releases), an explicit seed reproduces the same run on every build.
pub fn seed_from_str(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn category_rank(c: PositionCategory) -> i32 {
    match c {
        PositionCategory::GK => 0,
        PositionCategory::DEF => 1,
        PositionCategory::MID => 2,
        PositionCategory::ATT => 3,
    }
}

/// How badly a player of category `p` fits a slot of category `slot`:
/// an adjacent line is a reasonable stand-in; swapping into or out of goal
/// is a last resort.
fn misfit(slot: PositionCategory, p: PositionCategory) -> i32 {
    let gk_swap = (slot == PositionCategory::GK) != (p == PositionCategory::GK);
    (category_rank(slot) - category_rank(p)).abs() + if gk_swap { 10 } else { 0 }
}

/// Which flank a squad role plays on: -1 left (low y), 0 central, 1 right.
fn flank(role: Option<&str>) -> i8 {
    match role.unwrap_or("") {
        "LB" | "LWB" | "LM" | "LW" => -1,
        "RB" | "RWB" | "RM" | "RW" => 1,
        _ => 0,
    }
}

/// Picks the starting XI from a squad and puts each starter in a formation
/// slot. Returns 11 entries in slot order; `None` where the squad ran out.
///
/// 1. The manager's `Lineup.startingXI` first (healthy players only).
/// 2. A goalkeeper is guaranteed if the squad has one.
/// 3. Each line (GK/DEF/MID/ATT) is filled to what THIS formation needs,
///    best rated first; then any remaining places by rating.
/// 4. Within a line, starters are spread across its slots by flank (a
///    left-back on the left); a line that came up short takes the
///    best-fitting spare starter.
///
/// Injured players are only used when there aren't 11 healthy ones.
pub fn select_starting_xi(
    squad: &[RawPlayer],
    preferred: &[String],
    slots: &[FormationSlot; 11],
) -> Vec<Option<RawPlayer>> {
    let category = |p: &RawPlayer| parse_position(p.position.as_deref());
    let rating = |p: &RawPlayer| p.rating.unwrap_or(0.0);

    // Selection order: healthy by rating, then injured by rating.
    let mut pool: Vec<usize> = (0..squad.len()).collect();
    pool.sort_by(|&a, &b| {
        squad[a]
            .is_injured()
            .cmp(&squad[b].is_injured())
            .then(rating(&squad[b]).total_cmp(&rating(&squad[a])))
    });

    let mut chosen: Vec<usize> = Vec::with_capacity(11);
    let mut taken = vec![false; squad.len()];

    for id in preferred {
        if chosen.len() >= 11 {
            break;
        }
        if let Some(i) = squad.iter().position(|p| p.id.as_deref() == Some(id.as_str())) {
            if !taken[i] && !squad[i].is_injured() {
                taken[i] = true;
                chosen.push(i);
            }
        }
    }

    let need = |c: PositionCategory| slots.iter().filter(|s| s.position == c).count();
    let has = |c: PositionCategory, chosen: &[usize]| chosen.iter().filter(|&&i| category(&squad[i]) == c).count();

    if has(PositionCategory::GK, &chosen) == 0 {
        if let Some(&gk) = pool.iter().find(|&&i| !taken[i] && category(&squad[i]) == PositionCategory::GK) {
            if chosen.len() >= 11 {
                // The manager named 11 without a keeper - the lowest-priority
                // pick makes way.
                let dropped = chosen.pop().unwrap();
                taken[dropped] = false;
            }
            taken[gk] = true;
            chosen.push(gk);
        }
    }

    for c in [PositionCategory::GK, PositionCategory::DEF, PositionCategory::MID, PositionCategory::ATT] {
        for &i in &pool {
            if chosen.len() >= 11 || has(c, &chosen) >= need(c) {
                break;
            }
            if !taken[i] && category(&squad[i]) == c {
                taken[i] = true;
                chosen.push(i);
            }
        }
    }
    for &i in &pool {
        if chosen.len() >= 11 {
            break;
        }
        if !taken[i] {
            taken[i] = true;
            chosen.push(i);
        }
    }

    // Slot assignment, line by line.
    let mut result: Vec<Option<RawPlayer>> = vec![None; 11];
    let mut spare: Vec<usize> = Vec::new();
    for c in [PositionCategory::GK, PositionCategory::DEF, PositionCategory::MID, PositionCategory::ATT] {
        let mut line_slots: Vec<usize> = (0..11).filter(|&s| slots[s].position == c).collect();
        line_slots.sort_by(|&a, &b| slots[a].anchor.y.total_cmp(&slots[b].anchor.y));

        let mut line_players: Vec<usize> = chosen.iter().copied().filter(|&i| category(&squad[i]) == c).collect();
        line_players.sort_by(|&a, &b| rating(&squad[b]).total_cmp(&rating(&squad[a])));
        spare.extend(line_players.drain(line_slots.len().min(line_players.len())..));
        line_players.sort_by_key(|&i| flank(squad[i].role.as_deref()));

        for (&slot, &player) in line_slots.iter().zip(line_players.iter()) {
            result[slot] = Some(squad[player].clone());
        }
    }
    for s in 0..11 {
        if result[s].is_some() || spare.is_empty() {
            continue;
        }
        let slot_cat = slots[s].position;
        let best = (0..spare.len())
            .min_by(|&a, &b| {
                let (pa, pb) = (&squad[spare[a]], &squad[spare[b]]);
                misfit(slot_cat, category(pa))
                    .cmp(&misfit(slot_cat, category(pb)))
                    .then(rating(pb).total_cmp(&rating(pa)))
            })
            .unwrap();
        result[s] = Some(squad[spare.remove(best)].clone());
    }
    result
}

/// Ids given to stand-in players when a squad has fewer than 11 - they get
/// no PlayerStats row and never appear as an event's playerID.
const SYNTHETIC_ID_PREFIX: &str = "auto_";

fn ts_event(ev: &EngineEvent, players: &[SimPlayer; 22], codes: [&str; 2]) -> TsEvent {
    let real_id = |i: usize| {
        let id = &players[i].id;
        (!id.starts_with(SYNTHETIC_ID_PREFIX)).then(|| id.clone())
    };
    let label = |i: usize| format!("{} [{}]", players[i].name, codes[players[i].team_index]);
    let name = |i: usize| players[i].name.clone();
    // Displayed minute: the 1st minute is "1", full time "90".
    let minute = (ev.minute as u32 + 1).min(90).to_string();

    let (event_type, message, data) = match ev.kind {
        EventKind::KickOff => ("match", "Match Kick-Off".to_string(), None),
        EventKind::HalfTime => ("match", "First Half Over".to_string(), None),
        EventKind::FullTime => ("match", "Match Over".to_string(), None),
        EventKind::Goal { penalty } => {
            let mut msg = format!("{} scored", ev.player.map(label).unwrap_or_default());
            if penalty {
                msg.push_str(" (penalty)");
            } else if let Some(a) = ev.other {
                msg.push_str(&format!(", assisted by {}", name(a)));
            }
            let data = json!({ "xG": ev.xg, "penalty": penalty, "assistID": ev.other.and_then(real_id) });
            ("goal", msg, Some(data))
        }
        EventKind::Save { penalty } => {
            let what = if penalty { "penalty" } else { "shot" };
            let msg = format!(
                "{} saved a {} from {}",
                ev.player.map(label).unwrap_or_default(),
                what,
                ev.other.map(name).unwrap_or_default()
            );
            let data = json!({ "xG": ev.xg, "penalty": penalty, "shooterID": ev.other.and_then(real_id) });
            ("save", msg, Some(data))
        }
        EventKind::Miss { penalty, blocked } => {
            let shooter = ev.player.map(label).unwrap_or_default();
            let msg = match (blocked, ev.other) {
                (true, Some(b)) => format!("{} had a shot blocked by {}", shooter, name(b)),
                _ => format!("{} missed a shot", shooter),
            };
            let data = json!({ "xG": ev.xg, "penalty": penalty, "blocked": blocked });
            ("miss", msg, Some(data))
        }
        EventKind::Foul { card, penalty } => {
            let card_name = match card {
                CardState::Yellow => Some("yellow"),
                CardState::Red => Some("red"),
                CardState::None => None,
            };
            let mut msg = format!(
                "Foul by {} on {}",
                ev.player.map(label).unwrap_or_default(),
                ev.other.map(name).unwrap_or_default()
            );
            if let Some(c) = card_name {
                msg.push_str(&format!(" ({} card)", c));
            }
            if penalty {
                msg.push_str(" - penalty!");
            }
            ("foul", msg, Some(json!({ "card": card_name, "penalty": penalty })))
        }
    };

    TsEvent {
        event_type: event_type.to_string(),
        message,
        time: minute,
        player_id: ev.player.and_then(real_id),
        player_team_id: ev.player.map(|i| codes[players[i].team_index].to_string()),
        data,
    }
}

fn build_squad(club: &RawClub, slots: &[FormationSlot; 11], team_idx: usize) -> Vec<SimPlayer> {
    let squad = club.players.clone().unwrap_or_default();
    let preferred = club
        .lineup
        .as_ref()
        .and_then(|l| l.starting_xi.clone())
        .unwrap_or_default();

    select_starting_xi(&squad, &preferred, slots)
        .into_iter()
        .enumerate()
        .map(|(i, picked)| match picked {
            Some(p) => {
                let name = p.Name.clone().unwrap_or_else(|| {
                    format!("{} {}", p.first_name.as_deref().unwrap_or(""), p.last_name.as_deref().unwrap_or(""))
                        .trim()
                        .to_string()
                });
                let rating = p.rating.unwrap_or(60.0);
                let position = parse_position(p.position.as_deref());
                let attributes = parse_attributes(p.attributes.clone(), rating);
                SimPlayer {
                    id: p.id.clone().unwrap_or_else(|| format!("{}{}_{}", SYNTHETIC_ID_PREFIX, team_idx, i)),
                    name,
                    position,
                    rating,
                    role: PlayerRole::from_squad_role(p.role.as_deref(), position, &attributes),
                    boost: 1.0,
                    attributes,
                    pos: Vec2::ZERO,
                    target_pos: Vec2::ZERO,
                    anchor_pos: Vec2::ZERO,
                    // A tired player starts the match short of breath: half of
                    // their missing fitness carries into starting stamina.
                    stamina: p.stamina.unwrap_or_else(|| {
                        100.0 - (100.0 - p.fitness.unwrap_or(100.0).clamp(0.0, 100.0)) * crate::config::CFG.fitness_carry
                    }),
                    condition: p.fitness.unwrap_or(100.0),
                    cards: CardState::None,
                    is_sent_off: false,
                    team_index: team_idx,
                    squad_index: i,
                    shirt_number: p.shirt_number.clone().unwrap_or_else(|| (i + 1).to_string()),
                }
            }
            // Squad too small: a stand-in for the slot's line.
            None => SimPlayer {
                id: format!("{}{}_{}", SYNTHETIC_ID_PREFIX, team_idx, i),
                name: format!("Player {}", i + 1),
                position: slots[i].position,
                role: PlayerRole::default_for(slots[i].position),
                boost: 1.0,
                rating: 55.0,
                attributes: Attributes::default(),
                pos: Vec2::ZERO,
                target_pos: Vec2::ZERO,
                anchor_pos: Vec2::ZERO,
                stamina: 100.0,
                condition: 100.0,
                cards: CardState::None,
                is_sent_off: false,
                team_index: team_idx,
                squad_index: i,
                shirt_number: (i + 1).to_string(),
            },
        })
        .collect()
}

/// The engine for a fixture, before kick-off: XIs picked and slotted,
/// tactics resolved, RNG seeded. (Public for sim-lab's diagnostics.)
pub fn build_engine(home: &RawClub, away: &RawClub, tactics: Option<&RawTactics>, seed: &str) -> MatchEngine {
    let home_tactics = build_tactics(tactics.and_then(|t| t.home.as_ref()));
    let away_tactics = build_tactics(tactics.and_then(|t| t.away.as_ref()));
    let home_squad = build_squad(home, &home_tactics.slots, 0);
    let away_squad = build_squad(away, &away_tactics.slots, 1);
    let mut engine = MatchEngine::new(home_squad, away_squad, home_tactics, away_tactics, seed_from_str(seed));
    let orders = |raw: Option<&RawTactic>| {
        raw.and_then(|t| t.half_time.as_ref())
            .map(|h| crate::engine::HalfTimeOrders { losing: h.losing.clone(), drawing: h.drawing.clone(), winning: h.winning.clone() })
            .unwrap_or_default()
    };
    engine.half_time_orders = [orders(tactics.and_then(|t| t.home.as_ref())), orders(tactics.and_then(|t| t.away.as_ref()))];
    engine
}

pub fn run_simulation(req: SimulateMatchRequest) -> SimulateMatchResponse {
    let start_time = Instant::now();

    let home_club = req.clubs.iter().find(|c| c.id.as_deref() == Some(&req.sides.home));
    let away_club = req.clubs.iter().find(|c| c.id.as_deref() == Some(&req.sides.away));

    let (Some(home), Some(away)) = (home_club, away_club) else {
        return SimulateMatchResponse {
            ok: false,
            fixtureId: req.fixture_id,
            match_data: None,
            metrics: SimulationMetricsResponse { simulationMs: 0.0, totalMs: 0.0 },
            seed: req.seed,
            error: Some("Home or Away club missing in request".into()),
        };
    };

    let seed_str = req.seed.clone().unwrap_or_else(|| format!("{:016x}", rand::random::<u64>()));

    let sim_start = Instant::now();
    let mut engine = build_engine(home, away, req.tactics.as_ref(), &seed_str);
    engine.record_frames = req.include_frames.unwrap_or(true);
    engine.simulate_full_match();
    let sim_ms = sim_start.elapsed().as_secs_f64() * 1000.0;

    let home_code = home.code.clone().unwrap_or_default();
    let away_code = away.code.clone().unwrap_or_default();
    let codes = [home_code.as_str(), away_code.as_str()];

    // Events: one list for the match, and each on the frame it happened in
    // (frames are captured every tick, so frame index = tick).
    let events: Vec<TsEvent> = engine.events.iter().map(|e| ts_event(e, &engine.players, codes)).collect();
    let frame_count = engine.replay.tick.len() as u32;
    let replay = std::mem::take(&mut engine.replay);
    let frames = PackedFrames {
        format: "packed-v1".into(),
        scale: REPLAY_SCALE,
        roster: engine
            .players
            .iter()
            .map(|p| RosterEntry {
                id: p.id.clone(),
                side: if p.team_index == 0 { "home" } else { "away" }.into(),
                num: p.shirt_number.clone(),
                pos: format!("{:?}", p.position),
            })
            .collect(),
        tick: replay.tick,
        minute: replay.minute,
        half: replay.half,
        ball: replay.ball,
        xy: replay.xy,
        holder: replay.holder,
        status: replay.status,
        events: engine
            .events
            .iter()
            .zip(&events)
            .filter(|(e, _)| (e.tick as u32) < frame_count)
            .map(|(e, ts)| (e.tick as u32, ts.clone()))
            .collect(),
    };

    let (hs, as_) = (engine.home_stats.score, engine.away_stats.score);
    let draw = hs == as_;
    let home_ref = ClubRef { code: home_code.clone(), id: home.id.clone().unwrap_or_default() };
    let away_ref = ClubRef { code: away_code.clone(), id: away.id.clone().unwrap_or_default() };
    let (winner, loser) = match hs.cmp(&as_) {
        std::cmp::Ordering::Greater => (Some(home_ref), Some(away_ref)),
        std::cmp::Ordering::Less => (Some(away_ref), Some(home_ref)),
        std::cmp::Ordering::Equal => (None, None),
    };

    let is_real = |i: usize| !engine.players[i].id.starts_with(SYNTHETIC_ID_PREFIX);
    let player_rows = |team: usize| -> Vec<PlayerStatsRow> {
        (team * 11..team * 11 + 11)
            .filter(|&i| is_real(i))
            .map(|i| {
                let st = &engine.player_stats[i];
                PlayerStatsRow {
                    PlayerId: engine.players[i].id.clone(),
                    Goals: st.goals,
                    Assists: st.assists,
                    Saves: st.saves,
                    Shots: st.shots,
                    Passes: st.passes,
                    Tackles: st.tackles,
                    Fouls: st.fouls,
                    YellowCards: st.yellow_cards,
                    RedCards: st.red_cards,
                    Dribbles: st.dribbles,
                    Interceptions: st.interceptions,
                    CleanSheets: st.clean_sheets,
                    Points: st.points,
                }
            })
            .collect()
    };

    // Highest points; ties go to the earlier squad index (home first).
    let motm = (0..22)
        .filter(|&i| is_real(i))
        .max_by(|&a, &b| {
            engine.player_stats[a]
                .points
                .total_cmp(&engine.player_stats[b].points)
                .then(b.cmp(&a))
        })
        .map(|i| Motm {
            id: engine.players[i].id.clone(),
            name: engine.players[i].name.clone(),
            clubcode: codes[engine.players[i].team_index].to_string(),
            points: engine.player_stats[i].points,
        });

    let total_poss = (engine.home_stats.possession_ticks + engine.away_stats.possession_ticks).max(1) as f32;
    let home_poss = ((engine.home_stats.possession_ticks as f32 / total_poss) * 100.0).round();

    let side = |team: usize, club: &RawClub, stats: &TeamMatchStats, possession: f32, won: bool| SideDetails {
        ClubId: club.id.clone().unwrap_or_default(),
        FixtureId: req.fixture_id.clone(),
        TimesWithBall: stats.possession_ticks,
        Possession: possession,
        Goals: stats.score,
        TotalShots: stats.shots,
        ShotsOnTarget: stats.shots_on_target,
        ShotsOffTarget: stats.shots.saturating_sub(stats.shots_on_target),
        Fouls: stats.fouls,
        YellowCards: stats.yellow_cards,
        RedCards: stats.red_cards,
        Passes: stats.passes_completed,
        PassesAttempted: stats.passes,
        Tackles: stats.tackles,
        XG: (stats.xg * 100.0).round() / 100.0,
        Events: events
            .iter()
            .filter(|e| e.player_team_id.as_deref() == Some(codes[team]))
            .cloned()
            .collect(),
        PlayerStats: player_rows(team),
        Won: won,
        Drew: draw,
    };

    let details = MatchDetailsResponse {
        Title: format!("{} vs {}", home.name.clone().unwrap_or_default(), away.name.clone().unwrap_or_default()),
        LeagueName: String::new(),
        Draw: draw,
        Played: true,
        FirstHalfScore: format!("{} - {}", engine.half_time_score.0, engine.half_time_score.1),
        FullTimeScore: format!("{} - {}", hs, as_),
        HomeTeamScore: hs,
        AwayTeamScore: as_,
        Winner: winner,
        Loser: loser,
        MOTM: motm,
        TotalPasses: engine.home_stats.passes_completed + engine.away_stats.passes_completed,
        Goals: hs as u16 + as_ as u16,
        HomeTeamDetails: side(0, home, &engine.home_stats, home_poss, hs > as_),
        AwayTeamDetails: side(1, away, &engine.away_stats, 100.0 - home_poss, as_ > hs),
    };

    let match_data = MatchSimulatedData {
        Home: MatchSummaryTeam {
            _id: home.id.clone().unwrap_or_default(),
            Name: home.name.clone().unwrap_or_default(),
            ClubCode: home_code.clone(),
            ManagerId: home.manager_id.clone().unwrap_or_default(),
        },
        Away: MatchSummaryTeam {
            _id: away.id.clone().unwrap_or_default(),
            Name: away.name.clone().unwrap_or_default(),
            ClubCode: away_code.clone(),
            ManagerId: away.manager_id.clone().unwrap_or_default(),
        },
        Details: details,
        Events: events,
        Frames: frames,
    };

    let total_ms = start_time.elapsed().as_secs_f64() * 1000.0;

    SimulateMatchResponse {
        ok: true,
        fixtureId: req.fixture_id,
        match_data: Some(match_data),
        metrics: SimulationMetricsResponse {
            simulationMs: sim_ms,
            totalMs: total_ms,
        },
        seed: Some(seed_str),
        error: None,
    }
}
