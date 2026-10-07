// packages/api-contract/src/replay.ts
//
// Match replay frames: the per-tick picture of a match the engine records,
// shared by the server (storage, streaming) and the client (Matchzone).
//
// A match is ~720 frames x 22 players. As plain frames every one repeats
// each player's id, side, shirt number, position, status and all the JSON
// keys - ~5 MB. Packed, the per-player constants are stored once
// (`roster`), positions are flat integer arrays, and the things that rarely
// change (status, cards, events, list order) are stored only when they
// change: ~165 KB. The Rust engine (crates/sim-core types.rs PackedFrames)
// writes the packed form directly - keep the two in step.

export type MatchPlayerStatus = 'active' | 'sent-off' | 'substituted';

/** An engine event as it travels on a frame. */
export interface MatchFrameEvent {
  type: string;
  message: string;
  /** Match minute, as a string ("1".."90"). */
  time?: string;
  playerID?: string;
  /** The acting player's club CODE (not id). */
  playerTeamID?: string;
  /** Per type - goal: { xG, penalty, assistID }; save: { xG, penalty,
   * shooterID }; miss: { xG, penalty, blocked }; foul: { card, penalty }. */
  data?: any;
}

export interface MatchFramePlayer {
  id: string;
  side: 'home' | 'away';
  num: string;
  pos: string;
  /** Grid units: x 0-32 (goal line to goal line), y 0-20 (touchline to
   * touchline). Home attacks +x in the first half. */
  x: number;
  y: number;
  withBall: boolean;
  matchStatus: MatchPlayerStatus;
  yellowCards: number;
  redCards: number;
}

/** One engine tick (~7.5 s of match time). */
export interface MatchFrame {
  tick: number;
  minute: number;
  half: 1 | 2;
  ball: { x: number; y: number };
  players: MatchFramePlayer[];
  events: MatchFrameEvent[];
}

export interface PackedRosterEntry {
  id: string;
  side: 'home' | 'away';
  num: string;
  pos: string;
}

/** A player's status from frame `frame` on (until the next change). */
export type PackedStatusChange = [
  frame: number,
  slot: number,
  matchStatus: MatchPlayerStatus,
  yellowCards: number,
  redCards: number,
];

export interface PackedFrames {
  format: 'packed-v1';
  /** Stored position integers per grid unit. */
  scale: number;
  roster: PackedRosterEntry[];
  tick: number[];
  minute: number[];
  half: number[];
  /** Ball per frame: x0, y0, x1, y1, ... (scaled). */
  ball: number[];
  /** Per frame, per roster slot: x, y (scaled); -1, -1 = not on the frame. */
  xy: number[];
  /** Roster slot on the ball per frame, -1 for nobody. */
  holder: number[];
  /** Everyone starts 'active' with no cards; only changes are stored. */
  status: PackedStatusChange[];
  events: [frame: number, event: MatchFrameEvent][];
  /** The order players are listed in, as roster slots - only on frames
   * where it changes. Absent: roster order throughout. */
  order?: [frame: number, slots: number[]][];
}

/** Packed (current), or plain (replays saved before packing). */
export type MatchFrames = MatchFrame[] | PackedFrames;

const SCALE = 10;
const ABSENT = -1;

export function isPacked(frames: MatchFrames): frames is PackedFrames {
  return !Array.isArray(frames) && (frames as PackedFrames)?.format === 'packed-v1';
}

export function frameCount(frames: MatchFrames | null | undefined): number {
  if (!frames) return 0;
  return isPacked(frames) ? frames.tick.length : frames.length;
}

export function packFrames(frames: MatchFrame[]): PackedFrames {
  // Roster: every player who appears, home before away, each side in order
  // of first appearance - a sub who comes on later lands after his side's
  // starters, as in the frames.
  const seen = new Map<string, PackedRosterEntry>();
  for (const f of frames) {
    for (const p of f.players) {
      if (!seen.has(p.id)) seen.set(p.id, { id: p.id, side: p.side, num: p.num, pos: p.pos });
    }
  }
  const roster = [...seen.values()].sort((a, b) => (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1));
  const slotOf = new Map(roster.map((r, i) => [r.id, i]));

  const packed: PackedFrames = {
    format: 'packed-v1',
    scale: SCALE,
    roster,
    tick: [],
    minute: [],
    half: [],
    ball: [],
    xy: [],
    holder: [],
    status: [],
    events: [],
    order: [],
  };
  let lastOrder = '';

  const last = roster.map(() => ({ status: 'active', y: 0, r: 0 }));
  frames.forEach((f, frame) => {
    packed.tick.push(f.tick);
    packed.minute.push(f.minute);
    packed.half.push(f.half);
    packed.ball.push(Math.round(f.ball.x * SCALE), Math.round(f.ball.y * SCALE));

    const xy = new Array<number>(roster.length * 2).fill(ABSENT);
    let holder = ABSENT;
    for (const p of f.players) {
      const slot = slotOf.get(p.id)!;
      xy[slot * 2] = Math.round(p.x * SCALE);
      xy[slot * 2 + 1] = Math.round(p.y * SCALE);
      if (p.withBall) holder = slot;
      const prev = last[slot]!;
      if (prev.status !== p.matchStatus || prev.y !== p.yellowCards || prev.r !== p.redCards) {
        packed.status.push([frame, slot, p.matchStatus, p.yellowCards, p.redCards]);
        last[slot] = { status: p.matchStatus, y: p.yellowCards, r: p.redCards };
      }
    }
    packed.xy.push(...xy);
    packed.holder.push(holder);
    const order = f.players.map((p) => slotOf.get(p.id)!);
    const key = order.join(',');
    if (key !== lastOrder) {
      packed.order!.push([frame, order]);
      lastOrder = key;
    }
    for (const e of f.events) packed.events.push([frame, e]);
  });

  return packed;
}

/** Back to plain frames (a plain array passes through unchanged). */
export function unpackFrames(frames: MatchFrames): MatchFrame[] {
  if (!isPacked(frames)) return frames;

  const { roster, scale } = frames;
  const status = roster.map(() => ({ matchStatus: 'active' as MatchPlayerStatus, yellowCards: 0, redCards: 0 }));
  let nextStatus = 0;
  let nextEvent = 0;
  let nextOrder = 0;
  let order = roster.map((_, slot) => slot);

  return frames.tick.map((tick, frame) => {
    while (nextStatus < frames.status.length && frames.status[nextStatus]![0] === frame) {
      const [, slot, matchStatus, yellowCards, redCards] = frames.status[nextStatus++]!;
      status[slot] = { matchStatus, yellowCards, redCards };
    }
    const orders = frames.order ?? [];
    while (nextOrder < orders.length && orders[nextOrder]![0] === frame) {
      order = orders[nextOrder++]![1];
    }
    const events: MatchFrameEvent[] = [];
    while (nextEvent < frames.events.length && frames.events[nextEvent]![0] === frame) {
      events.push(frames.events[nextEvent++]![1]);
    }

    const base = frame * roster.length * 2;
    const players: MatchFramePlayer[] = [];
    order.forEach((slot) => {
      const r = roster[slot]!;
      const x = frames.xy[base + slot * 2]!;
      if (x === ABSENT) return;
      players.push({
        id: r.id,
        side: r.side,
        num: r.num,
        pos: r.pos,
        x: x / scale,
        y: frames.xy[base + slot * 2 + 1]! / scale,
        withBall: frames.holder[frame] === slot,
        ...status[slot]!,
      });
    });

    return {
      tick,
      minute: frames.minute[frame]!,
      half: frames.half[frame]! as 1 | 2,
      ball: { x: frames.ball[frame * 2]! / scale, y: frames.ball[frame * 2 + 1]! / scale },
      players,
      events,
    };
  });
}
