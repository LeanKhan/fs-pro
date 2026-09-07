import { EventEmitter } from 'events';
import { IMatchEvent } from '../classes/Match';

const ballMove = new EventEmitter();

const matchEvents = new EventEmitter();

ballMove.setMaxListeners(24);
matchEvents.setMaxListeners(24);

/**
 * CreateMatchEvent...
 * TODO: use an object as parameter instead...
 * @param message
 * @param type
 * @param playerID
 * @param playerTeamID
 */

function createMatchEvent(
  match_id: string,
  message: IMatchEvent['message'],
  type: IMatchEvent['type'],
  playerID?: IMatchEvent['playerID'],
  playerTeamID?: IMatchEvent['playerTeamID'],
  /** Milestone 13 (Passing Options And Decision Evaluation) - `IMatchEvent.data`
   * existed as a field long before this but nothing ever actually passed
   * anything into it; first real use is `Match.ts`'s pass/interception
   * listeners carrying `{ passType }` for pass-type distribution/
   * completion metrics (see `simRealismCheck.ts`). */
  data?: IMatchEvent['data']
) {
  matchEvents.emit(match_id + '-event', {
    message,
    type,
    playerID,
    playerTeamID,
    data,
  } as IMatchEvent);
}

export { ballMove, matchEvents, createMatchEvent };
