/**
 * Replay playback: turns the engine's frames (one per ~7.5 s tick) into a
 * continuous match the stadium can draw at any instant.
 *
 * - Players move along Catmull-Rom curves through their tick positions, so
 *   runs bend instead of zig-zagging between snapshots.
 * - The ball stays at the holder's feet; when the holder changes it travels
 *   (lofted for long balls); on a shot it flies to the goal, the keeper or
 *   wide, and a goal holds for a celebration before the kick-off reset.
 * - Events are indexed once, so the HUD can draw a timeline, the score and
 *   stats at any moment, and the stage can fire effects as time crosses
 *   them - forwards or after a seek.
 *
 * Pure logic, no three.js: positions come out in metres on a pitch centred
 * at the origin (x along the 105 m length, z across the 68 m width).
 */
import type { MatchFrame, MatchFrameEvent } from '@repo/api-contract';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
const GRID_X = 32;
const GRID_Y = 20;
const GOAL_HALF_WIDTH = 3.66;

/** Real seconds per engine tick at 1x - a full match in ~5 minutes. */
export const SECONDS_PER_TICK = 0.42;
/** A goal holds the clock this long (seconds at 1x) for the celebration. */
const GOAL_HOLD_SECONDS = 1.8;

export const toWorldX = (gx: number) => (gx / GRID_X - 0.5) * PITCH_LENGTH;
export const toWorldZ = (gy: number) => (gy / GRID_Y - 0.5) * PITCH_WIDTH;

export type Side = 'home' | 'away';

export type EventKind =
  | 'kickoff'
  | 'half'
  | 'full'
  | 'goal'
  | 'penalty-goal'
  | 'save'
  | 'miss'
  | 'block'
  | 'yellow'
  | 'red'
  | 'foul';

export interface TimelineEvent {
  /** Index of the frame the event is recorded on. */
  frame: number;
  minute: number;
  kind: EventKind;
  side: Side | null;
  playerId?: string;
  /** Assister (goal), shooter (save), blocker (block), victim (foul). */
  otherId?: string;
  xg?: number;
  penalty?: boolean;
  message: string;
  raw: MatchFrameEvent;
}

export interface PlayerState {
  id: string;
  side: Side;
  num: string;
  pos: string;
  x: number;
  z: number;
  /** Facing, radians around +y (0 = facing +x). */
  heading: number;
  /** Ground speed, m/s of match time - drives the run cycle. */
  speed: number;
  withBall: boolean;
  sentOff: boolean;
  yellow: number;
  red: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  holderId: string | null;
  /** In flight between holders or on a shot. */
  flying: boolean;
}

export interface Moment {
  /** Playback position, in frames (fractional). */
  t: number;
  minute: number;
  half: 1 | 2;
  score: [number, number];
  players: PlayerState[];
  ball: BallState;
  possession: Side | null;
  /** Set during a goal's celebration hold. */
  celebrating: { side: Side; scorerId?: string } | null;
}

export interface SideStats {
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  fouls: number;
  yellow: number;
  red: number;
}

const KIND_OF: Record<string, (e: MatchFrameEvent) => EventKind | null> = {
  match: (e) =>
    /kick-off/i.test(e.message) ? 'kickoff' : /first half over/i.test(e.message) ? 'half' : /match over/i.test(e.message) ? 'full' : null,
  goal: (e) => (e.data?.penalty ? 'penalty-goal' : 'goal'),
  save: () => 'save',
  miss: (e) => (e.data?.blocked ? 'block' : 'miss'),
  foul: (e) => (e.data?.card === 'red' ? 'red' : e.data?.card === 'yellow' ? 'yellow' : 'foul'),
};

/** Deterministic 0..1 from a string - stable shot targets, skin tones... */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class Playback {
  readonly frames: MatchFrame[];
  readonly events: TimelineEvent[];
  readonly homeCode: string;
  readonly awayCode: string;
  /** Playback position in frames. */
  t = 0;
  speed = 1;
  playing = false;
  /** Real seconds per frame at 1x: every match lasts about as long,
   * whatever its tick length (old replays have 180 frames, not 720). */
  readonly secondsPerTick: number;

  /** Goal frames -> the hold inserted before them (real playback ticks). */
  private goalFrames: Set<number>;
  private holdLeft = 0;
  private holdFrame = -1;

  constructor(frames: MatchFrame[], homeCode: string, awayCode: string) {
    this.frames = frames;
    this.homeCode = homeCode;
    this.awayCode = awayCode;
    this.secondsPerTick = (SECONDS_PER_TICK * 720) / Math.max(60, frames.length);
    this.events = [];
    frames.forEach((f, frame) => {
      for (const raw of f.events) {
        const kind = KIND_OF[raw.type]?.(raw);
        if (!kind) continue;
        const side: Side | null = raw.playerTeamID === homeCode ? 'home' : raw.playerTeamID === awayCode ? 'away' : null;
        this.events.push({
          frame,
          minute: Number(raw.time ?? f.minute + 1),
          kind,
          side,
          playerId: raw.playerID,
          otherId: raw.data?.assistID ?? raw.data?.shooterID ?? undefined,
          xg: typeof raw.data?.xG === 'number' ? raw.data.xG : undefined,
          penalty: !!raw.data?.penalty,
          message: raw.message,
          raw,
        });
      }
    });
    this.goalFrames = new Set(this.events.filter((e) => e.kind === 'goal' || e.kind === 'penalty-goal').map((e) => e.frame));
  }

  get lastFrame(): number {
    return this.frames.length - 1;
  }

  get finished(): boolean {
    return this.t >= this.lastFrame;
  }

  /**
   * Advances by `dt` real seconds. Returns the events crossed, in order -
   * the stage and HUD fire their effects from these. A goal pauses the
   * clock for its celebration first.
   */
  advance(dt: number): TimelineEvent[] {
    if (!this.playing || this.finished) return [];
    let ticks = (dt * this.speed) / this.secondsPerTick;
    const before = this.t;

    if (this.holdLeft > 0) {
      const used = Math.min(this.holdLeft, ticks);
      this.holdLeft -= used;
      ticks -= used;
      if (ticks <= 0) return [];
    }

    let next = Math.min(this.lastFrame, this.t + ticks);
    // Stop at a goal frame to hold the celebration (the ball sits in the
    // net while the kick-off reset waits).
    for (let f = Math.floor(before) + 1; f <= Math.floor(next); f++) {
      if (this.goalFrames.has(f) && this.holdFrame !== f) {
        next = f - 0.001;
        this.holdFrame = f;
        this.holdLeft = GOAL_HOLD_SECONDS / this.secondsPerTick;
        break;
      }
    }
    this.t = next;
    return this.crossed(before, next);
  }

  /** Jumps to `t` (frames). No effects fire for what's skipped. */
  seek(t: number) {
    this.t = Math.max(0, Math.min(this.lastFrame, t));
    this.holdLeft = 0;
    this.holdFrame = -1;
  }

  /** Events whose flight/impact happens in (from, to]. Shots land just
   * before their frame (the ball reaches the goal as the tick ends). */
  private crossed(from: number, to: number): TimelineEvent[] {
    const landAt = (e: TimelineEvent) => (isShot(e.kind) ? e.frame - 0.35 : e.frame);
    return this.events.filter((e) => landAt(e) > from && landAt(e) <= to + (this.holdLeft > 0 ? 0.36 : 0));
  }

  scoreAt(t: number): [number, number] {
    const s: [number, number] = [0, 0];
    for (const e of this.events) {
      if (e.frame - 0.35 > t) break;
      if (e.kind === 'goal' || e.kind === 'penalty-goal') s[e.side === 'home' ? 0 : 1]++;
    }
    return s;
  }

  statsAt(t: number): { home: SideStats; away: SideStats } {
    const blank = (): SideStats => ({ goals: 0, shots: 0, onTarget: 0, xg: 0, fouls: 0, yellow: 0, red: 0 });
    const out = { home: blank(), away: blank() };
    for (const e of this.events) {
      if (e.frame > t) break;
      if (!e.side) continue;
      const s = out[e.side];
      if (e.kind === 'yellow' || e.kind === 'red' || e.kind === 'foul') {
        s.fouls++;
        if (e.kind === 'yellow') s.yellow++;
        if (e.kind === 'red') s.red++;
        continue;
      }
      if (!isShot(e.kind)) continue;
      // A save is credited to the keeper's side; the shot belongs to the other.
      const shooting = e.kind === 'save' ? out[e.side === 'home' ? 'away' : 'home'] : s;
      shooting.shots++;
      shooting.xg += e.xg ?? 0;
      if (e.kind !== 'miss' && e.kind !== 'block') shooting.onTarget++;
      if (e.kind === 'goal' || e.kind === 'penalty-goal') shooting.goals++;
    }
    return out;
  }

  /** xG per `bucket` minutes for each side - the momentum chart. */
  xgMomentum(bucket = 5): { home: number[]; away: number[] } {
    const n = Math.ceil(90 / bucket);
    const home = new Array(n).fill(0);
    const away = new Array(n).fill(0);
    for (const e of this.events) {
      if (!isShot(e.kind) || e.xg == null) continue;
      const shooter = e.kind === 'save' ? (e.side === 'home' ? 'away' : 'home') : e.side;
      const i = Math.min(n - 1, Math.floor((e.minute - 1) / bucket));
      (shooter === 'home' ? home : away)[i] += e.xg;
    }
    return { home, away };
  }

  /** The match at playback position `t` (default: now). */
  moment(t = this.t): Moment {
    const frames = this.frames;
    const i = Math.max(0, Math.min(this.lastFrame, Math.floor(t)));
    const j = Math.min(this.lastFrame, i + 1);
    const u = Math.min(1, Math.max(0, t - i));
    const a = frames[i];
    const b = frames[j];
    const prev = frames[Math.max(0, i - 1)];
    const next = frames[Math.min(this.lastFrame, j + 1)];
    const index = (f: MatchFrame) => new Map(f.players.map((p) => [p.id, p]));
    const [pa, pb, pp, pn] = [index(a), index(b), index(prev), index(next)];

    // A goal recorded on frame j means b is the kick-off reset: hold
    // positions (and the ball in the net) instead of sliding everyone
    // back to the centre circle.
    const goalAhead = this.events.find((e) => e.frame === j && (e.kind === 'goal' || e.kind === 'penalty-goal'));
    const freeze = !!goalAhead && j !== i;

    const players: PlayerState[] = a.players.map((p) => {
      const q = (freeze ? p : pb.get(p.id)) ?? p;
      const p0 = pp.get(p.id) ?? p;
      const p3 = (freeze ? p : pn.get(p.id)) ?? q;
      const x = catmull(toWorldX(p0.x), toWorldX(p.x), toWorldX(q.x), toWorldX(p3.x), u);
      const z = catmull(toWorldZ(p0.y), toWorldZ(p.y), toWorldZ(q.y), toWorldZ(p3.y), u);
      // Velocity from the curve's tangent, for heading and the run cycle.
      const e = 0.04;
      const x2 = catmull(toWorldX(p0.x), toWorldX(p.x), toWorldX(q.x), toWorldX(p3.x), Math.min(1, u + e));
      const z2 = catmull(toWorldZ(p0.y), toWorldZ(p.y), toWorldZ(q.y), toWorldZ(p3.y), Math.min(1, u + e));
      const dx = x2 - x;
      const dz = z2 - z;
      const moving = Math.hypot(dx, dz) > 1e-4;
      const speed = moving ? Math.hypot(dx, dz) / (e * 7.5) : 0;
      return {
        id: p.id,
        side: p.side,
        num: p.num,
        pos: p.pos,
        x,
        z,
        heading: moving ? Math.atan2(-dz, dx) : NaN,
        speed: Math.min(9, speed),
        withBall: p.withBall,
        sentOff: p.matchStatus === 'sent-off',
        yellow: p.yellowCards,
        red: p.redCards,
      };
    });

    const holderA = a.players.find((p) => p.withBall)?.id ?? null;
    const holderB = b.players.find((p) => p.withBall)?.id ?? null;
    const at = (id: string | null) => (id ? players.find((p) => p.id === id) : undefined);
    const shot = this.events.find((e) => e.frame === j && isShot(e.kind));

    let ball: BallState;
    if (shot && j !== i) {
      ball = this.shotFlight(shot, a, u);
    } else if (holderA && holderA === holderB) {
      // Dribbling: at the holder's feet, a stride ahead.
      const h = at(holderA)!;
      const head = Number.isNaN(h.heading) ? 0 : h.heading;
      ball = { x: h.x + Math.cos(head) * 0.7, y: 0.11, z: h.z - Math.sin(head) * 0.7, holderId: holderA, flying: false };
    } else {
      // Changing hands: travels from where it was to where it ends up,
      // lofted for a long ball.
      const sx = toWorldX(a.ball.x);
      const sz = toWorldZ(a.ball.y);
      const ex = toWorldX(b.ball.x);
      const ez = toWorldZ(b.ball.y);
      const k = smooth(Math.min(1, u * 1.6));
      const dist = Math.hypot(ex - sx, ez - sz);
      const lift = dist > 22 ? Math.min(7, dist * 0.14) : dist > 10 ? 0.6 : 0.1;
      ball = {
        x: sx + (ex - sx) * k,
        y: 0.11 + Math.sin(Math.PI * k) * lift,
        z: sz + (ez - sz) * k,
        holderId: k >= 1 ? holderB : null,
        flying: k < 1,
      };
    }

    const minute = Math.min(90, Math.round(a.minute + (b.minute - a.minute) * u) + 1);
    const holder = at(ball.holderId ?? holderA);
    const goalNow = goalAhead && freeze && u > 0.65 ? goalAhead : null;
    return {
      t,
      minute,
      half: a.half,
      score: this.scoreAt(t),
      players,
      ball,
      possession: holder?.side ?? null,
      celebrating: goalNow ? { side: goalNow.side ?? 'home', scorerId: goalNow.playerId } : null,
    };
  }

  /** Which way `side` attacks on frame `f` (+1 = towards +x). Home attacks
   * +x in the first half. */
  attackDir(side: Side, f: MatchFrame): 1 | -1 {
    const firstHalf = f.half === 1;
    return (side === 'home') === firstHalf ? 1 : -1;
  }

  /** The ball's path for a shot recorded on the frame after `a`. */
  private shotFlight(shot: TimelineEvent, a: MatchFrame, u: number): BallState {
    // The shooter is the actor for goals/misses/blocks, the "other" for saves.
    const shooterId = shot.kind === 'save' ? shot.otherId : shot.playerId;
    const shooter = a.players.find((p) => p.id === shooterId) ?? a.players.find((p) => p.withBall);
    const sx = shooter ? toWorldX(shooter.x) : toWorldX(a.ball.x);
    const sz = shooter ? toWorldZ(shooter.y) : toWorldZ(a.ball.y);
    const shooterSide = (shooter?.side ?? (shot.side === 'home' ? 'away' : 'home')) as Side;
    const dir = this.attackDir(shooterSide, a);
    const goalX = (dir * PITCH_LENGTH) / 2;
    const r = hash01(`${shot.frame}:${shot.kind}`);

    let tx: number, ty: number, tz: number;
    if (shot.kind === 'goal' || shot.kind === 'penalty-goal') {
      tx = goalX + dir * 1.6; // into the net
      ty = 0.3 + r * 1.9;
      tz = (r - 0.5) * 2 * (GOAL_HALF_WIDTH - 0.5);
    } else if (shot.kind === 'save') {
      tx = goalX - dir * 0.8; // into the keeper's hands
      ty = 0.6 + r * 1.2;
      tz = (r - 0.5) * 3;
    } else if (shot.kind === 'block') {
      tx = sx + (goalX - sx) * 0.25;
      ty = 0.5;
      tz = sz + (0 - sz) * 0.25;
    } else {
      tx = goalX + dir * 3; // wide or over
      ty = 0.8 + r * 2.5;
      tz = (r < 0.5 ? -1 : 1) * (GOAL_HALF_WIDTH + 1 + r * 4);
    }
    // The strike happens late in the tick: build-up first, then the flight.
    const k = Math.max(0, Math.min(1, (u - 0.35) / 0.3));
    const kk = smooth(k);
    const dist = Math.hypot(tx - sx, tz - sz);
    return {
      x: sx + (tx - sx) * kk,
      y: 0.11 + (ty - 0.11) * kk + Math.sin(Math.PI * kk) * Math.min(2.5, dist * 0.05),
      z: sz + (tz - sz) * kk,
      holderId: k <= 0 ? shooterId ?? null : null,
      flying: k > 0,
    };
  }
}

export function isShot(kind: EventKind): boolean {
  return kind === 'goal' || kind === 'penalty-goal' || kind === 'save' || kind === 'miss' || kind === 'block';
}
