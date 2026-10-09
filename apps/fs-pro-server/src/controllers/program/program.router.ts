import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { advanceProgram, dismissTip, getChapterState, getProgramState, getTip, requestLoan } from '../../services/program/owner-program.service';
import { browseManagers, interviewManager, releaseManager, signManager } from '../../services/program/manager-market.service';
import { browsePlayers, scoutPlayer, signPlayer } from '../../services/program/free-agent-market.service';
import { ProgramGateError } from '../../services/program/squad-gate';

const s = initServer();

const ok = <T>(message: string, payload: T) => ({
  status: 200 as const,
  body: { success: true as const, message, payload },
});

/** Program errors carry a status (`ProgramGateError` 409); everything else is
 * 400/404 by message, matching the play router. */
function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    err instanceof ProgramGateError
      ? (err.status as 409)
      : /not found/i.test(message)
        ? (404 as const)
        : (400 as const);
  return {
    status,
    body: { success: false as const, message, payload: message },
  };
}

async function run<T>(fn: () => Promise<{ message: string; payload: T }>) {
  try {
    const { message, payload } = await fn();
    return ok(message, payload) as any;
  } catch (err) {
    return errorResponse(err) as any;
  }
}

export const programTsRestRoutes = s.router(contract.program, {
  getProgram: ({ params }) => run(async () => ({ message: 'Program state', payload: await getProgramState(params.clubId) })),

  advanceProgram: ({ params }) =>
    run(async () => ({ message: 'Program advanced', payload: await advanceProgram(params.clubId) })),

  dismissTip: ({ params }) =>
    run(async () => ({
      message: 'Tip dismissed',
      payload: { dismissed: await dismissTip(params.clubId, params.tipId) },
    })),

  tip: ({ params, body }) =>
    run(async () => ({
      message: 'Advisor tip',
      payload: {
        tip: await getTip(
          params.clubId,
          {
            shows: body.shows,
            lastShownAt: body.lastShownAt,
            dismissed: body.dismissed,
            quiet: body.quiet,
          },
          body.now,
          body.events
        ),
      },
    })),

  browseManagers: ({ params }) =>
    run(async () => ({ message: 'Manager market', payload: await browseManagers(params.clubId) })),

  interviewManager: ({ params }) =>
    run(async () => ({
      message: 'Manager interviewed',
      payload: { managers: await interviewManager(params.clubId, params.managerId) },
    })),

  signManager: ({ params, body }) =>
    run(async () => ({
      message: 'Manager signed',
      payload: await signManager(params.clubId, params.managerId, body?.contractYears ?? 3),
    })),

  releaseManager: ({ params }) =>
    run(async () => ({
      message: 'Manager released',
      payload: await releaseManager(params.clubId, params.managerId),
    })),

  browsePlayers: ({ params }) =>
    run(async () => ({ message: 'Free agents', payload: await browsePlayers(params.clubId) })),

  scoutPlayer: ({ params }) =>
    run(async () => ({
      message: 'Player scouted',
      payload: { players: await scoutPlayer(params.clubId, params.playerId) },
    })),

  signPlayer: ({ params }) =>
    run(async () => ({
      message: 'Player signed',
      payload: await signPlayer(params.clubId, params.playerId),
    })),

  requestLoan: ({ params }) =>
    run(async () => {
      const { granted, amount } = await requestLoan(params.clubId);
      return { message: 'Board advance', payload: { granted, amount, state: await getProgramState(params.clubId) } };
    }),

  getProgramChapter: ({ params }) =>
    run(async () => ({ message: 'Chapter', payload: await getChapterState(params.clubId) })),
});
