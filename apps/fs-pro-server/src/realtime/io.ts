import { Namespace, Server, Socket } from 'socket.io';
import log from '../helpers/logger';

/**
 * Match replay uses its own namespace rather than the default '/' one, so the
 * standalone debug client can connect without a browser session cookie.
 */
const MATCH_REPLAY_NS = '/match-replay';

let ioInstance: Server | undefined;

export function registerIO(io: Server): void {
  console.log('Registering IO');
  ioInstance = io;

  io.of(MATCH_REPLAY_NS).on('connection', (socket: Socket) => {
    console.log(`[replay] client connected: ${socket.id}`);

    socket.on('watch-match', (fixtureId: string) => {
      socket.join(fixtureId);
      console.log(`[replay] socket ${socket.id} joined room ${fixtureId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[replay] client disconnected: ${socket.id}`);
    });
  });

  log('Match-replay Socket.IO namespace registered');
}

export function getMatchReplayNamespace(): Namespace {
  if (!ioInstance) {
    throw new Error(
      'IO not registered yet - call registerIO() in server.ts first'
    );
  }
  return ioInstance.of(MATCH_REPLAY_NS);
}
