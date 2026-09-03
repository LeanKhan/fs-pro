import { Router } from 'express';
import { initServer } from '@ts-rest/express';

import { clubTsRestRoutes } from '../controllers/clubs/club.router';
import { playerTsRestRoutes } from '../controllers/players/player.router';
import { competitionTsRestRoutes } from '../controllers/competitions/competition.router';
import { seasonTsRestRoutes } from '../controllers/seasons/season.router';
import { userTsRestRoutes } from '../controllers/user/user.router';
import { gameTsRestRoutes } from '../controllers/game/game.router';
import { transferTsRestRoutes } from '../controllers/transfers/transfer.router';
import { calendarTsRestRoutes } from '../controllers/calendar/calendar.router';
import { fixtureTsRestRoutes } from '../controllers/fixtures/fixture.router';
import files from '../services/file/file.service';
import { managerTsRestRoutes } from '../controllers/managers/manager.router';
import { placeTsRestRoutes } from '../controllers/places/places.router';
import { awardTsRestRoutes } from '../controllers/awards/awards.router';
import { metaTsRestRoutes } from '../controllers/meta/meta.router';

// Contract...
import { apiContract } from '@repo/api-contract';

const s = initServer();

export const apiRouter = s.router(apiContract, {
  clubs: clubTsRestRoutes,
  meta: metaTsRestRoutes,
  fixtures: fixtureTsRestRoutes,
  players: playerTsRestRoutes,
  competitions: competitionTsRestRoutes,
  managers: managerTsRestRoutes,
  calendar: calendarTsRestRoutes,
  places: placeTsRestRoutes,
  awards: awardTsRestRoutes,
  seasons: seasonTsRestRoutes,
  users: userTsRestRoutes,
  game: gameTsRestRoutes,
  transfers: transferTsRestRoutes,
});

// export default mainRouter;

const router = Router();

router.use('/files', files);

router.get('/random-test', (req, res) => {
  res.send({
    o: req.originalUrl,
    p: req.path,
    h: req.header('Host'),
    oo: req.header('Origin'),
    s: req.socket.localPort,
  });
});

export default router;
