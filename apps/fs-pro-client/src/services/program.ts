/**
 * The owner program's client access layer (phase-2 OWNER-PROGRAM-SPEC §10.1).
 *
 * Every function wraps the ts-rest `client.program.*` route with a narrow,
 * typed result so the screens never poke at envelopes. The server owns the
 * step, the stars and every money write; this layer only reads and asks.
 *
 * The whole module is intentionally thin: one function per route, untyped
 * `body` only at the envelope boundary.
 */
import { client } from '@/services/api';
import type {
  ProgramChapter,
  ProgramLoan,
  ProgramManagerList,
  ProgramPlayerList,
  ProgramScoutReveal,
  ProgramSignResult,
  ProgramState,
} from '@repo/api-contract';

/** ts-rest responses are strict unions; unwrap the success envelope or throw. */
async function unwrap<T>(res: { status: number; body: unknown }): Promise<T> {
  const body = res.body as { success?: boolean; message?: string; payload?: unknown };
  if (res.status !== 200 || body?.success !== true) {
    throw new Error(body?.message || `Request failed (${res.status})`);
  }
  return body.payload as T;
}

export async function fetchProgramState(clubId: string): Promise<ProgramState> {
  return unwrap<ProgramState>(await client.program.getProgram.query({ params: { clubId } }));
}

export async function advanceProgram(clubId: string): Promise<ProgramState> {
  return unwrap<ProgramState>(await client.program.advanceProgram.mutation({ params: { clubId }, body: {} }));
}

export async function dismissTip(clubId: string, tipId: string): Promise<string[]> {
  const payload = await unwrap<{ dismissed: string[] }>(
    await client.program.dismissTip.mutation({ params: { clubId, tipId }, body: {} })
  );
  return payload.dismissed;
}

export async function fetchProgramChapter(clubId: string): Promise<ProgramChapter> {
  return unwrap<ProgramChapter>(await client.program.getProgramChapter.query({ params: { clubId } }));
}

export async function fetchManagerMarket(clubId: string): Promise<ProgramManagerList> {
  return unwrap<ProgramManagerList>(await client.program.browseManagers.query({ params: { clubId } }));
}

export async function interviewManager(clubId: string, managerId: string): Promise<ProgramScoutReveal> {
  return unwrap<ProgramScoutReveal>(
    await client.program.interviewManager.mutation({ params: { clubId, managerId }, body: {} })
  );
}

export async function signManager(
  clubId: string,
  managerId: string,
  contractYears?: number
): Promise<ProgramSignResult> {
  return unwrap<ProgramSignResult>(
    await client.program.signManager.mutation({
      params: { clubId, managerId },
      body: contractYears ? { contractYears } : {},
    })
  );
}

export async function releaseManager(clubId: string, managerId: string): Promise<ProgramState> {
  return unwrap<ProgramState>(
    await client.program.releaseManager.mutation({ params: { clubId, managerId }, body: {} })
  );
}

export async function fetchFreeAgents(clubId: string): Promise<ProgramPlayerList> {
  return unwrap<ProgramPlayerList>(await client.program.browsePlayers.query({ params: { clubId } }));
}

export async function scoutFreeAgent(clubId: string, playerId: string): Promise<ProgramScoutReveal> {
  return unwrap<ProgramScoutReveal>(
    await client.program.scoutPlayer.mutation({ params: { clubId, playerId }, body: {} })
  );
}

export async function signFreeAgent(clubId: string, playerId: string): Promise<ProgramSignResult> {
  return unwrap<ProgramSignResult>(
    await client.program.signPlayer.mutation({ params: { clubId, playerId }, body: {} })
  );
}

export async function requestBoardAdvance(clubId: string): Promise<ProgramLoan> {
  return unwrap<ProgramLoan>(await client.program.requestLoan.mutation({ params: { clubId }, body: {} }));
}
