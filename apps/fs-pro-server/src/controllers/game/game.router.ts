import { Router } from 'express';
import {
  restPlayGame,
  restUpdateStandings,
  restPlayGameNew,
  restEnqueueMatch,
} from './game.controller';

const router = Router();

router.get('/kickoff/:fixture', restPlayGame, restUpdateStandings);

router.get('/kickoff-new/:fixture', restPlayGameNew);

router.get('/enqueue/:fixture', restEnqueueMatch);

export default router;
