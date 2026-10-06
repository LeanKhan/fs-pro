/**
 * Compact replay frames.
 *
 * A match is ~720 frames x 22 players. As `IMatchFrame[]` every frame
 * repeats each player's id, side, shirt number, position, status and all
 * the JSON keys - ~5 MB of JSON per match, through the sim service, the
 * worker hop and into the MatchReplays table. Packed, the per-player
 * constants are stored once (`roster`), positions are flat integer arrays,
 * and the things that rarely change (status, cards, events) are stored only
 * when they change: ~40x smaller.
 *
 * Packed is the server-side transport/storage format. The client never
 * sees it: `matchBroadcaster` unpacks just before streaming, one
 * `IMatchFrame` at a time, exactly as before. `MatchFrames` accepts both
 * forms, so replays saved before packing existed still play.
 *
 * Produced by the Rust engine directly (crates/sim-core contract.rs) and by
 * `packFrames` for the in-process engine - keep the two in step.
 */
import type { IMatchEvent, IMatchFrame, IMatchFramePlayer } from '../simulation/classes/Match';

export interface IPackedRosterEntry {
  id: string;
  side: 'home' | 'away';
  num: string;
  pos: string;
}

/** A player's status from frame `frame` on (until the next change). */
export type PackedStatusChange = [
  frame: number,
  slot: number,
  matchStatus: IMatchFramePlayer['matchStatus'],
  yellowCards: number,
  redCards: number,
];

export interface IPackedFrames {
  format: 'packed-v1';
  /** Stored position integers per grid unit (x 0-32, y 0-20). */
  scale: number;
  roster: IPackedRosterEntry[];
  tick: number[];
  minute: number[];
  half: number[];
  /** Ball per frame: x0, y0, x1, y1, ... (scaled). */
  ball: number[];
  /** Per frame, per roster slot: x, y (scaled); -1, -1 = not on the
   * frame (not yet subbed on). */
  xy: number[];
  /** Roster slot on the ball per frame, -1 for nobody. */
  holder: number[];
  /** Everyone starts 'active' with no cards; only changes are stored. */
  status: PackedStatusChange[];
  /** The order players are listed in, as roster slots - stored only on
   * frames where it changes (the in-process engine re-sorts its squad at
   * half-time and on substitutions). Absent: roster order throughout. */
  order?: [frame: number, slots: number[]][];
  events: [frame: number, event: IMatchEvent][];
}

export type MatchFrames = IMatchFrame[] | IPackedFrames;

const SCALE = 10;
const ABSENT = -1;

export function isPacked(frames: MatchFrames): frames is IPackedFrames {
  return !Array.isArray(frames) && (frames as IPackedFrames)?.format === 'packed-v1';
}

export function frameCount(frames: MatchFrames): number {
  return isPacked(frames) ? frames.tick.length : frames.length;
}

export function packFrames(frames: IMatchFrame[]): IPackedFrames {
  // Roster: every player who appears, home before away (the order frames
  // list them in), each side in order of first appearance - so a sub who
  // comes on later lands after his side's starters, as in the frames.
  const seen = new Map<string, IPackedRosterEntry>();
  for (const f of frames) {
    for (const p of f.players) {
      if (!seen.has(p.id)) seen.set(p.id, { id: p.id, side: p.side, num: p.num, pos: p.pos });
    }
  }
  const roster = [...seen.values()].sort((a, b) => (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1));
  const slotOf = new Map(roster.map((r, i) => [r.id, i]));

  const packed: IPackedFrames = {
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
      const prev = last[slot];
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

/** Back to `IMatchFrame[]` (a legacy array passes through unchanged). */
export function unpackFrames(frames: MatchFrames): IMatchFrame[] {
  if (!isPacked(frames)) return frames;

  const { roster, scale } = frames;
  const status = roster.map(() => ({ matchStatus: 'active' as IMatchFramePlayer['matchStatus'], yellowCards: 0, redCards: 0 }));
  let nextStatus = 0;
  let nextEvent = 0;
  let nextOrder = 0;
  let order = roster.map((_, slot) => slot);

  return frames.tick.map((tick, frame) => {
    while (nextStatus < frames.status.length && frames.status[nextStatus][0] === frame) {
      const [, slot, matchStatus, yellowCards, redCards] = frames.status[nextStatus++];
      status[slot] = { matchStatus, yellowCards, redCards };
    }
    const orders = frames.order ?? [];
    while (nextOrder < orders.length && orders[nextOrder][0] === frame) {
      order = orders[nextOrder++][1];
    }
    const events: IMatchEvent[] = [];
    while (nextEvent < frames.events.length && frames.events[nextEvent][0] === frame) {
      events.push(frames.events[nextEvent++][1]);
    }

    const base = frame * roster.length * 2;
    const players: IMatchFramePlayer[] = [];
    order.forEach((slot) => {
      const r = roster[slot];
      const x = frames.xy[base + slot * 2];
      if (x === ABSENT) return;
      players.push({
        id: r.id,
        side: r.side,
        num: r.num,
        pos: r.pos,
        x: x / scale,
        y: frames.xy[base + slot * 2 + 1] / scale,
        withBall: frames.holder[frame] === slot,
        ...status[slot],
      });
    });

    return {
      tick,
      minute: frames.minute[frame],
      half: frames.half[frame] as 1 | 2,
      ball: { x: frames.ball[frame * 2] / scale, y: frames.ball[frame * 2 + 1] / scale },
      players,
      events,
    };
  });
}
