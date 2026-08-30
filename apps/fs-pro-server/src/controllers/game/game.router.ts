import { Router } from 'express';
import {
  restPlayGame,
  restUpdateStandings,
  restPlayGameNew,
  restEnqueueMatch,
  restCreateFriendly,
  restTacticOptions,
} from './game.controller';

const router = Router();

router.get('/kickoff/:fixture', restPlayGame, restUpdateStandings);

router.get('/kickoff-new/:fixture', restPlayGameNew);

router.get('/enqueue/:fixture', restEnqueueMatch);

router.get('/tactic-options', restTacticOptions);

router.post('/friendly', restCreateFriendly);

export default router;
