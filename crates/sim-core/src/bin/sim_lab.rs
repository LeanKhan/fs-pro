// crates/sim-core/src/bin/sim_lab.rs
//
// Realism + agency lab: do matches look like football, and do a manager's
// decisions (squad quality, attributes, style, formation) move results?
//
// Every experiment uses common random numbers: control and variant replay
// the SAME seeded fixtures, so a difference is caused by the change, not by
// luck. Matches run headless (no frames) across all cores.
//
//   cargo run --release --bin sim-lab -- [pairs] [section...]
//   sections: realism even quality diag boost attributes styles formations agency orders (default: all)

use serde_json::{json, Value};
use sim_core::contract::{build_engine, run_simulation, RawClub, RawTactics, SimulateMatchRequest};
use std::fs;
use std::time::Instant;

const POOL: &str = "../../apps/fs-pro-server/src/scripts/fixtures/simulation-roster-pool.json";
const STYLES: [&str; 5] = ["Balanced", "HighPress", "LowBlock", "Possession", "Direct"];
const FORMATIONS: [&str; 4] = ["433", "442", "4231", "352"];
const ATTRIBUTES: [&str; 21] = [
    "Speed", "Mental", "Vision", "Agility", "Control", "Keeping", "Marking", "Stamina", "Crossing",
    "LongPass", "LongShot", "SetPiece", "Shooting", "Strength", "Tackling", "Dribbling", "ShortPass",
    "ShotPower", "Aggression", "Positioning", "Interception",
];

#[derive(Clone)]
struct Fixture {
    home: Value,
    away: Value,
    seed: String,
}

#[derive(Clone, Copy, Default)]
struct Outcome {
    hg: f64,
    ag: f64,
    poss: f64,
    hshots: f64,
    ashots: f64,
    sot: f64,
    passes: f64,
    completed: f64,
    hpasses: f64,
    tackles: f64,
    fouls: f64,
    yellows: f64,
    reds: f64,
    hxg: f64,
    axg: f64,
}

impl Outcome {
    fn points(&self) -> f64 {
        if self.hg > self.ag { 3.0 } else if self.hg == self.ag { 1.0 } else { 0.0 }
    }
    fn gd(&self) -> f64 {
        self.hg - self.ag
    }
}

fn tactic(formation: &str, style: &str) -> Value {
    json!({ "formationName": formation, "styleName": style })
}

fn play(f: &Fixture, home_tactic: &Value, away_tactic: &Value) -> Outcome {
    let req: SimulateMatchRequest = serde_json::from_value(json!({
        "fixtureId": f.seed,
        "seed": f.seed,
        "includeFrames": false,
        "clubs": [f.home, f.away],
        "sides": { "home": f.home["_id"], "away": f.away["_id"] },
        "tactics": { "home": home_tactic, "away": away_tactic },
    }))
    .unwrap();
    let resp = run_simulation(req);
    let d = &resp.match_data.expect("match").Details;
    let (h, a) = (&d.HomeTeamDetails, &d.AwayTeamDetails);
    let n = |x: u16| x as f64;
    Outcome {
        hg: d.HomeTeamScore as f64,
        ag: d.AwayTeamScore as f64,
        poss: h.Possession as f64,
        hshots: n(h.TotalShots),
        ashots: n(a.TotalShots),
        sot: n(h.ShotsOnTarget + a.ShotsOnTarget),
        passes: n(h.PassesAttempted + a.PassesAttempted),
        completed: n(h.Passes + a.Passes),
        hpasses: n(h.PassesAttempted),
        tackles: n(h.Tackles + a.Tackles),
        fouls: n(h.Fouls + a.Fouls),
        yellows: (h.YellowCards + a.YellowCards) as f64,
        reds: (h.RedCards + a.RedCards) as f64,
        hxg: h.XG as f64,
        axg: a.XG as f64,
    }
}

/// Runs every fixture (with `home` transformed) on all cores, in order.
fn play_all(fixtures: &[Fixture], ht: &Value, at: &Value, transform: Option<&(dyn Fn(&Value) -> Value + Sync)>) -> Vec<Outcome> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let chunk = fixtures.len().div_ceil(threads).max(1);
    std::thread::scope(|s| {
        let handles: Vec<_> = fixtures
            .chunks(chunk)
            .map(|part| {
                s.spawn(move || {
                    part.iter()
                        .map(|f| match transform {
                            Some(t) => play(&Fixture { home: t(&f.home), ..f.clone() }, ht, at),
                            None => play(f, ht, at),
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

/// -1/0/1 (`f64::signum` maps 0.0 to 1.0, which would count draws as wins).
fn sign(x: f64) -> f64 {
    if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 }
}

fn mean(xs: impl Iterator<Item = f64>) -> f64 {
    let v: Vec<f64> = xs.collect();
    v.iter().sum::<f64>() / v.len().max(1) as f64
}

/// Paired difference (variant - control) with its standard error.
fn paired(control: &[f64], variant: &[f64]) -> (f64, f64) {
    let d: Vec<f64> = variant.iter().zip(control).map(|(v, c)| v - c).collect();
    let m = mean(d.iter().copied());
    let var = mean(d.iter().map(|x| (x - m).powi(2)));
    (m, (var / d.len() as f64).sqrt())
}

/// Average Rating of a club's best 11.
fn xi_rating(club: &Value) -> f64 {
    let mut r: Vec<f64> = club["Players"].as_array().unwrap().iter().map(|p| p["Rating"].as_f64().unwrap_or(0.0)).collect();
    r.sort_by(|a, b| b.total_cmp(a));
    mean(r.into_iter().take(11))
}

fn boost(delta: impl Fn(&str, f64) -> f64 + Sync) -> impl Fn(&Value) -> Value + Sync {
    move |club: &Value| {
        let mut c = club.clone();
        for p in c["Players"].as_array_mut().unwrap() {
            if let Some(attrs) = p["Attributes"].as_object_mut() {
                for (k, v) in attrs.iter_mut() {
                    if let Some(x) = v.as_f64() {
                        *v = json!(delta(k, x).min(99.0));
                    }
                }
            }
        }
        c
    }
}

/// Attaches a fixed `effects` array to every player in a club.
fn with_effects(effects: Value) -> impl Fn(&Value) -> Value + Sync {
    move |club: &Value| {
        let mut c = club.clone();
        for p in c["Players"].as_array_mut().unwrap() {
            p["effects"] = effects.clone();
        }
        c
    }
}

/// A home tactic carrying manager orders.
fn tactic_orders(formation: &str, style: &str, orders: Value) -> Value {
    let mut t = tactic(formation, style);
    t["orders"] = orders;
    t
}

fn realism(base: &[Outcome]) {
    let n = |f: fn(&Outcome) -> f64| mean(base.iter().map(f));
    let pct = |pred: fn(&Outcome) -> bool| 100.0 * base.iter().filter(|o| pred(o)).count() as f64 / base.len() as f64;
    println!("\n=== Realism (per match, both teams; real-world reference in brackets) ===");
    println!("goals {:.2} [2.5-2.9] | xG {:.2} | shots {:.1} [22-28] | on target {:.1} [8-10] | home poss {:.0}%", n(|o| o.hg + o.ag), n(|o| o.hxg + o.axg), n(|o| o.hshots + o.ashots), n(|o| o.sot), n(|o| o.poss));
    println!("passes {:.0} [800-1100] | completion {:.1}% [78-86] | tackles {:.1} [30-40] | fouls {:.1} [20-26]", n(|o| o.passes), 100.0 * n(|o| o.completed) / n(|o| o.passes), n(|o| o.tackles), n(|o| o.fouls));
    println!("yellows {:.2} [3-4] | reds {:.2} [0.1-0.25] | home W/D/L {:.0}/{:.0}/{:.0} [45/25/30]", n(|o| o.yellows), n(|o| o.reds), pct(|o| o.hg > o.ag), pct(|o| o.hg == o.ag), pct(|o| o.hg < o.ag));
}

fn quality(fixtures: &[Fixture], base: &[Outcome]) {
    let rows: Vec<(f64, f64)> = fixtures.iter().zip(base).map(|(f, o)| (xi_rating(&f.home) - xi_rating(&f.away), o.gd())).collect();
    let (mg, md) = (mean(rows.iter().map(|r| r.0)), mean(rows.iter().map(|r| r.1)));
    let cov = mean(rows.iter().map(|r| (r.0 - mg) * (r.1 - md)));
    let (vg, vd) = (mean(rows.iter().map(|r| (r.0 - mg).powi(2))), mean(rows.iter().map(|r| (r.1 - md).powi(2))));
    println!("\n=== Quality: does the stronger XI win? ===");
    println!("goal diff per rating point {:.3} | quality explains {:.0}% of goal diff [aim 30-45%]", cov / vg, 100.0 * cov * cov / (vg * vd));
    for (lo, hi, aim) in [(0.0, 3.0, "~even"), (3.0, 8.0, "50-60%"), (8.0, 15.0, "65-75%"), (15.0, 100.0, "80-90%")] {
        let b: Vec<f64> = rows.iter().filter(|r| r.0.abs() >= lo && r.0.abs() < hi).map(|r| sign(r.0) * sign(r.1)).collect();
        let p = |v: f64| 100.0 * b.iter().filter(|&&x| x == v).count() as f64 / b.len().max(1) as f64;
        println!("gap {:>2}-{:<3}: {:>4} matches | stronger wins {:>3.0}% draw {:>3.0}% upset {:>3.0}%  [{}]", lo, hi, b.len(), p(1.0), p(0.0), p(-1.0), aim);
    }
}

/// Where the numbers come from: the decision mix, shot locations and how
/// often the carrier is challenged (Balanced v Balanced).
fn diag(fixtures: &[Fixture]) {
    let mut d = sim_core::engine::Diagnostics::default();
    let tactics: RawTactics = serde_json::from_value(json!({
        "home": tactic("433", "Balanced"), "away": tactic("433", "Balanced")
    }))
    .unwrap();
    for f in fixtures {
        let home: RawClub = serde_json::from_value(f.home.clone()).unwrap();
        let away: RawClub = serde_json::from_value(f.away.clone()).unwrap();
        let mut e = build_engine(&home, &away, Some(&tactics), &f.seed);
        e.record_frames = false;
        e.simulate_full_match();
        for i in 0..11 {
            d.decisions[i] += e.diag.decisions[i];
        }
        for i in 0..7 {
            d.pass_kinds[i] += e.diag.pass_kinds[i];
        }
        for i in 0..5 {
            d.shot_distance[i] += e.diag.shot_distance[i];
        }
        d.headers += e.diag.headers;
        d.cross_zone_ticks += e.diag.cross_zone_ticks;
        d.box_mates += e.diag.box_mates;
        d.carrier_ticks += e.diag.carrier_ticks;
        d.penalties += e.diag.penalties;
        d.contact_ticks += e.diag.contact_ticks;
        d.challenges += e.diag.challenges;
        d.orders_fired += e.diag.orders_fired;
        d.abilities_fired += e.diag.abilities_fired;
        d.tactical_fouls += e.diag.tactical_fouls;
        d.volleys += e.diag.volleys;
        d.trivelas += e.diag.trivelas;
        d.through_behinds += e.diag.through_behinds;
        d.sweeper_rush += e.diag.sweeper_rush;
    }
    let n = fixtures.len() as f64;
    let pct = |x: u32, t: u32| 100.0 * x as f64 / t.max(1) as f64;
    let total: u32 = d.decisions.iter().sum();
    let dec = |i: usize| pct(d.decisions[i], total);
    println!("\n=== Diagnostics (per match) ===");
    println!(
        "decisions/match {:.0}: shoot {:.1}% pass {:.1}% carry {:.1}% take-on {:.1}% hold {:.1}% clear {:.1}%",
        total as f64 / n, dec(0), dec(1), dec(2), dec(3), dec(4), dec(5)
    );
    let passes: u32 = d.pass_kinds.iter().sum();
    let pk = |i: usize| pct(d.pass_kinds[i], passes);
    println!(
        "pass mix: short {:.0}% backward {:.0}% wide {:.0}% long {:.0}% through {:.0}% cross {:.0}% switch {:.0}% | headers/match {:.1}",
        pk(0), pk(1), pk(2), pk(3), pk(4), pk(5), pk(6), d.headers as f64 / n
    );
    let shots: u32 = d.shot_distance.iter().sum();
    let sd = |i: usize| pct(d.shot_distance[i], shots);
    println!(
        "open-play shots by distance: <8m {:.0}% | 8-12 {:.0}% | 12-16.5 {:.0}% | 16.5-25 {:.0}% | 25+ {:.0}%  [~8/25/27/30/10]",
        sd(0), sd(1), sd(2), sd(3), sd(4)
    );
    println!(
        "carrier in crossing position {:.1} ticks/match, team-mates in the box then {:.2} on average",
        d.cross_zone_ticks as f64 / n,
        d.box_mates as f64 / d.cross_zone_ticks.max(1) as f64
    );
    println!(
        "carrier contact {:.0}% of ticks | challenges/match {:.1} | penalties/match {:.2} [0.25-0.3]",
        pct(d.contact_ticks, d.carrier_ticks),
        d.challenges as f64 / n,
        d.penalties as f64 / n
    );
    println!(
        "abilities/match: orders {:.2} | volleys {:.2} | trivelas {:.2} | through-behind {:.2} | sweeper {:.2} | tactical fouls {:.2} | decisions {:.1}% shoot-on-first-touch",
        d.orders_fired as f64 / n, d.volleys as f64 / n, d.trivelas as f64 / n,
        d.through_behinds as f64 / n, d.sweeper_rush as f64 / n, d.tactical_fouls as f64 / n,
        dec(6) + dec(7) + dec(8) + dec(9) + dec(10)
    );
}

/// One identical synthetic squad (1 GK, 5 DEF, 5 MID, 4 ATT, every rating
/// 70) so an outcome is decided by chance and shape, not talent.
fn even_squad(id: &str, prefix: &str) -> Value {
    let lines = ["DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "ATT", "ATT", "ATT", "ATT"];
    let mut players = vec![json!({ "id": format!("{prefix}gk"), "position": "GK", "Rating": 70.0 })];
    for (i, line) in lines.iter().enumerate() {
        players.push(json!({ "id": format!("{prefix}{:02}", i + 1), "position": line, "Rating": 70.0 }));
    }
    json!({ "_id": id, "Name": id, "ClubCode": id, "Players": players })
}

fn play_clubs(home: &Value, away: &Value, seed: &str, ht: &Value, at: &Value) -> (f64, f64, f64, f64) {
    let req: SimulateMatchRequest = serde_json::from_value(json!({
        "fixtureId": seed,
        "seed": seed,
        "includeFrames": false,
        "clubs": [home, away],
        "sides": { "home": home["_id"], "away": away["_id"] },
        "tactics": { "home": ht, "away": at },
    }))
    .unwrap();
    let d = run_simulation(req).match_data.expect("match").Details;
    (
        d.HomeTeamScore as f64,
        d.AwayTeamScore as f64,
        d.HomeTeamDetails.TotalShots as f64,
        d.AwayTeamDetails.TotalShots as f64,
    )
}

/// Two identical squads ("even Standing"), home advantage removed by playing
/// every seed twice with the sides swapped. This is the split the product
/// target (~45-55% win) is about - and the one the aggregate `realism` row
/// hides behind squad-quality gaps.
fn even(pairs: usize) {
    let h = even_squad("H", "h");
    let a = even_squad("A", "a");
    let t = tactic("433", "Balanced");
    let (mut hw, mut dr, mut aw) = (0u32, 0u32, 0u32);
    let (mut hg, mut ag, mut hs, mut as_) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    for i in 0..pairs {
        let (hf, af, hs1, as1) = play_clubs(&h, &a, &format!("even:{i}:1"), &t, &t);
        let (ah, hh, ahs, hhs) = play_clubs(&a, &h, &format!("even:{i}:2"), &t, &t);
        hg += hf + hh;
        ag += af + ah;
        hs += hs1 + hhs;
        as_ += as1 + ahs;
        hw += (hf > af) as u32 + (hh > ah) as u32;
        dr += (hf == af) as u32 + (hh == ah) as u32;
        aw += (hf < af) as u32 + (hh < ah) as u32;
    }
    let n = (pairs * 2) as f64;
    println!("\n=== Even teams (identical 70-rated squads, 433 Balanced v Balanced, home swapped) ===");
    println!(
        "goals/match {:.2} | shots {:.1} | H W/D/L {:.0}/{:.0}/{:.0}%  [neutral target ~36/28/36]",
        (hg + ag) / n,
        (hs + as_) / n,
        100.0 * hw as f64 / n,
        100.0 * dr as f64 / n,
        100.0 * aw as f64 / n
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let pairs: usize = args.first().and_then(|a| a.parse().ok()).unwrap_or(400);
    let wanted: Vec<&str> = args.iter().filter(|a| a.parse::<usize>().is_err()).map(|s| s.as_str()).collect();
    let run = |s: &str| wanted.is_empty() || wanted.contains(&s);

    let pool: Value = serde_json::from_str(&fs::read_to_string(POOL).expect("roster pool")).unwrap();
    let clubs: Vec<Value> = pool["clubs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["Players"].as_array().is_some_and(|ps| ps.iter().any(|p| p["Position"] == "GK")))
        .cloned()
        .collect();

    // Seeded fixture list (xorshift) - identical across runs and builds.
    let mut x: u64 = 0x9e37_79b9_7f4a_7c15;
    let mut next = |n: usize| {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        (x % n as u64) as usize
    };
    let fixtures: Vec<Fixture> = (0..pairs)
        .map(|i| {
            let a = next(clubs.len());
            let mut b = next(clubs.len());
            while b == a {
                b = next(clubs.len());
            }
            Fixture { home: clubs[a].clone(), away: clubs[b].clone(), seed: format!("lab:{i}") }
        })
        .collect();

    let started = Instant::now();
    let balanced = tactic("433", "Balanced");
    let base = play_all(&fixtures, &balanced, &balanced, None);

    if run("realism") {
        realism(&base);
    }
    if wanted.contains(&"trace") {
        // The run of play before each of the first goals of one match.
        let tactics: RawTactics = serde_json::from_value(json!({
            "home": tactic("433", "Balanced"), "away": tactic("433", "Balanced")
        }))
        .unwrap();
        let f = &fixtures[0];
        let home: RawClub = serde_json::from_value(f.home.clone()).unwrap();
        let away: RawClub = serde_json::from_value(f.away.clone()).unwrap();
        let mut e = build_engine(&home, &away, Some(&tactics), &f.seed);
        e.record_frames = false;
        e.trace = Some(Vec::new());
        e.simulate_full_match();
        let lines = e.trace.take().unwrap();
        let goals: Vec<usize> = lines.iter().enumerate().filter(|(_, l)| l.contains("Goal")).map(|(i, _)| i).take(4).collect();
        for g in goals {
            println!("--- goal ---");
            for l in &lines[g.saturating_sub(10)..=g] {
                println!("{l}");
            }
        }
        return;
    }
    if run("diag") {
        diag(&fixtures);
    }
    if run("even") {
        even(pairs);
    }
    if run("quality") {
        quality(&fixtures, &base);
    }
    let pts = |os: &[Outcome]| os.iter().map(|o| o.points()).collect::<Vec<_>>();
    let gds = |os: &[Outcome]| os.iter().map(|o| o.gd()).collect::<Vec<_>>();
    if run("boost") {
        let v = play_all(&fixtures, &balanced, &balanced, Some(&boost(|_, x| x + 8.0)));
        let (dp, se) = paired(&pts(&base), &pts(&v));
        let (dg, seg) = paired(&gds(&base), &gds(&v));
        println!("\n=== Boost: every home attribute +8 ===\npoints/match {dp:+.2} (±{se:.2}) | goal diff {dg:+.2} (±{seg:.2})");
    }
    if run("attributes") {
        println!("\n=== Attributes: +20 on ONE attribute across the home squad (goal diff Δ) ===");
        for attr in ATTRIBUTES {
            let v = play_all(&fixtures, &balanced, &balanced, Some(&boost(move |k, x| if k == attr { x + 20.0 } else { x })));
            let (d, se) = paired(&gds(&base), &gds(&v));
            println!("{attr:<13} {d:+.2} ±{se:.2} {}", if d.abs() > 2.0 * se { "*" } else { "" });
        }
    }
    if run("styles") {
        println!("\n=== Styles: home points/match (rows = home style vs column away style, 433 v 433) ===");
        println!("{:<11}{}", "", STYLES.map(|s| format!("{s:>11}")).join(""));
        let mut sig = Vec::new();
        for hs in STYLES {
            let mut row = String::new();
            for aws in STYLES {
                let os = play_all(&fixtures, &tactic("433", hs), &tactic("433", aws), None);
                row.push_str(&format!("{:>11.2}", mean(os.iter().map(|o| o.points()))));
                if aws == "Balanced" {
                    sig.push((hs, os));
                }
            }
            println!("{hs:<11}{row}");
        }
        println!("\n=== Style signatures (home style vs Balanced) ===");
        for (s, os) in sig {
            let m = |f: fn(&Outcome) -> f64| mean(os.iter().map(f));
            println!(
                "{s:<11} poss {:>3.0}% | passes {:>4.0} | shots {:>4.1}-{:<4.1} | xG {:.2}-{:.2} | goals {:.2}-{:.2}",
                m(|o| o.poss), m(|o| o.hpasses), m(|o| o.hshots), m(|o| o.ashots), m(|o| o.hxg), m(|o| o.axg), m(|o| o.hg), m(|o| o.ag)
            );
        }
    }
    if run("formations") {
        println!("\n=== Formations: home points/match (Balanced v Balanced) ===");
        println!("{:<6}{}", "", FORMATIONS.map(|s| format!("{s:>8}")).join(""));
        for hf in FORMATIONS {
            let row: String = FORMATIONS
                .iter()
                .map(|af| format!("{:>8.2}", mean(play_all(&fixtures, &tactic(hf, "Balanced"), &tactic(af, "Balanced"), None).iter().map(|o| o.points()))))
                .collect();
            println!("{hf:<6}{row}");
        }
    }
    if run("agency") {
        // One ability set on every home player; common random numbers, so a
        // change is the ability, not luck. The intended metric is marked [*].
        let variants: [(&str, &str, Value); 9] = [
            ("ShotQuality", "shots/xG", json!([{ "kind": "ShotQuality", "params": { "bonus": 0.4 } }])),
            ("HeaderQuality", "shots/xG", json!([{ "kind": "HeaderQuality", "params": { "bonus": 0.5 } }])),
            ("CrossType/Inswing", "shots/xG", json!([{ "kind": "CrossType", "params": { "inswing": 0.5 } }])),
            ("Interception", "opp passes", json!([{ "kind": "Interception", "params": { "bonus": 0.5, "lane": 1.0 } }])),
            ("FirstTimeVolley", "shots/xG", json!([{ "kind": "NewAction", "params": { "volley": 1.0 } }, { "kind": "ShotQuality", "params": { "bonus": 0.2, "firstTime": 1.0 } }])),
            ("TrivelaSwitch", "passes", json!([{ "kind": "NewAction", "params": { "trivela": 1.0 } }])),
            ("ThroughBehind", "shots/xG", json!([{ "kind": "NewAction", "params": { "throughBall": 1.0 } }])),
            ("TacticalFoul", "fouls/cards", json!([{ "kind": "NewAction", "params": { "tacticalFoul": 1.0 } }])),
            ("StaminaSurge", "late goals", json!([{ "kind": "StaminaSurge", "params": { "below": 35.0, "amount": 25.0 } }])),
        ];
        println!("\n=== Agency: one ability set on the home squad (Δ per match vs balanced baseline; [*] = intended) ===");
        println!("{:<18}{:>8}{:>8}{:>8}{:>8}{:>8}{:>8}  [*]", "ability", "goals", "shots", "xG", "passes", "fouls", "yellows");
        for (name, target, eff) in variants {
            let t = with_effects(eff);
            let v = play_all(&fixtures, &balanced, &balanced, Some(&t));
            let d = |f: fn(&Outcome) -> f64| mean(v.iter().map(f)) - mean(base.iter().map(f));
            println!(
                "{:<18}{:>+8.2}{:>+8.2}{:>+8.2}{:>+8.0}{:>+8.2}{:>+8.2}  [{}]",
                name,
                d(|o| o.hg + o.ag),
                d(|o| o.hshots + o.ashots),
                d(|o| o.hxg + o.axg),
                d(|o| o.passes),
                d(|o| o.fouls),
                d(|o| o.yellows),
                target
            );
        }
    }
    if run("orders") {
        let variants: [(&str, Value); 4] = [
            ("OverloadFlank", json!([{ "kind": "OverloadFlank", "region": { "x0": 0.6, "y0": 0.0, "x1": 1.0, "y1": 0.4 }, "trigger": { "when": "MinuteAtLeast", "threshold": 15 } }])),
            ("PressTrap", json!([{ "kind": "PressTrap", "trigger": { "when": "Always", "threshold": 0 } }])),
            ("LowBlock", json!([{ "kind": "LowBlock", "trigger": { "when": "Always", "threshold": 0 } }])),
            ("Attack(60')", json!([{ "kind": "Attack", "trigger": { "when": "MinuteAtLeast", "threshold": 60 } }])),
        ];
        println!("\n=== Orders: one manager order on the home tactic (Δ per match vs balanced baseline) ===");
        println!("{:<14}{:>8}{:>8}{:>8}{:>8}{:>8}", "order", "pts", "goals", "shots", "xG", "poss");
        let bpts = mean(base.iter().map(|o| o.points()));
        for (name, orders) in variants {
            let v = play_all(&fixtures, &tactic_orders("433", "Balanced", orders), &balanced, None);
            let d = |f: fn(&Outcome) -> f64| mean(v.iter().map(f)) - mean(base.iter().map(f));
            println!(
                "{:<14}{:>+8.2}{:>+8.2}{:>+8.2}{:>+8.2}{:>+8.1}",
                name,
                mean(v.iter().map(|o| o.points())) - bpts,
                d(|o| o.hg - o.ag),
                d(|o| o.hshots - o.ashots),
                d(|o| o.hxg - o.axg),
                d(|o| o.poss)
            );
        }
    }
    println!("\n({pairs} seeded fixtures per cell, {:.1}s)", started.elapsed().as_secs_f64());
}
