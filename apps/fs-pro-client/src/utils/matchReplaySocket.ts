import { io, Socket } from 'socket.io-client';
import { apiUrl } from '@/services/api';

const REPLAY_NAMESPACE = '/match-replay';

export interface IMatchFramePlayer {
  id: string;
  side: 'home' | 'away';
  num: string;
  pos: string;
  x: number;
  y: number;
  withBall: boolean;
  matchStatus: 'active' | 'sent-off' | 'substituted';
  yellowCards: number;
  redCards: number;
}

export interface IMatchEvent {
  type: string;
  message: string;
  time?: string;
  playerID?: string;
  playerTeamID?: string;
  data?: any;
}

export interface IMatchFrame {
  tick: number;
  minute: number;
  half: 1 | 2;
  ball: { x: number; y: number };
  players: IMatchFramePlayer[];
  events: IMatchEvent[];
}

export interface IMatchReplayStart {
  fixtureId: string;
  home: { id: string; name: string; code: string };
  away: { id: string; name: string; code: string };
  totalFrames: number;
  tickMs: number;
}

export interface IMatchReplayEnd {
  fixtureId: string;
  details: any;
}

/**
 * Thin wrapper around the /match-replay Socket.IO namespace that
 * PitchPreview.html already exercises end-to-end. The server broadcasts a
 * fully-simulated match's frames to whoever has joined the room keyed by
 * fixture id - joining before kickoff is triggered is required, since there
 * is no catch-up buffer for late joiners.
 */
export class MatchReplaySocket {
  private socket: Socket | null = null;

  /** Connects (if needed) and joins `fixtureId`'s room. Resolves once
   * `watch-match` has been emitted on an open socket, or rejects if the
   * socket errors before connecting. */
  public watch(fixtureId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureConnected();

      const join = () => {
        socket.emit('watch-match', fixtureId);
        resolve();
      };

      if (socket.connected) {
        join();
      } else {
        socket.once('connect', join);
        socket.once('connect_error', (err) => reject(err));
      }
    });
  }

  public onReplayStart(handler: (payload: IMatchReplayStart) => void) {
    this.socket?.on('match-replay-start', handler);
  }

  public onFrame(handler: (frame: IMatchFrame) => void) {
    this.socket?.on('match-frame', handler);
  }

  public onReplayEnd(handler: (payload: IMatchReplayEnd) => void) {
    this.socket?.on('match-replay-end', handler);
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  private ensureConnected(): Socket {
    if (this.socket) return this.socket;

    this.socket = io(apiUrl + REPLAY_NAMESPACE, {
      transports: ['websocket', 'polling'],
    });

    return this.socket;
  }
}
