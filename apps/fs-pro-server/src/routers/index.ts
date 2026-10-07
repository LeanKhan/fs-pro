import { Router } from 'express';
import { initServer } from '@ts-rest/express';

import { clubTsRestRoutes } from '../controllers/clubs/club.router';
import { playerTsRestRoutes } from '../controllers/players/player.router';
import { seasonTsRestRoutes } from '../controllers/seasons/season.router';
import { userTsRestRoutes } from '../controllers/user/user.router';
import { gameTsRestRoutes } from '../controllers/game/game.router';
import { transferTsRestRoutes } from '../controllers/transfers/transfer.router';
import { facilitiesTsRestRoutes } from '../controllers/facilities/facilities.router';
import { playTsRestRoutes } from '../controllers/play/play.router';
import {
  challengeTsRestRoutes,
  editionTsRestRoutes,
} from '../controllers/open-play/open-play.router';
import { worldTsRestRoutes } from '../controllers/world/world.router';
import { competitionDefinitionTsRestRoutes } from '../controllers/open-play/competition-definitions.router';
import { calendarTsRestRoutes } from '../controllers/calendar/calendar.router';
import { fixtureTsRestRoutes } from '../controllers/fixtures/fixture.router';
import files from '../services/file/file.service';
import playerFace from '../controllers/players/player-face.router';
import managerFace from '../controllers/managers/manager-face.router';
import services from '../controllers/services/services.router';
import { managerTsRestRoutes } from '../controllers/managers/manager.router';
import { placeTsRestRoutes } from '../controllers/places/places.router';
import { awardTsRestRoutes } from '../controllers/awards/awards.router';
import { metaTsRestRoutes } from '../controllers/meta/meta.router';
import { atlasTsRestRoutes, crestRouter, kitRouter } from '../controllers/world/atlas.router';
import { realtimeRouter } from '../controllers/realtime/realtime.router';
import { routePolicy } from '../middleware/route-policy';

// Contract...
import { apiContract } from '@repo/api-contract';

const s = initServer();

export const apiRouter = s.router(apiContract, {
  clubs: clubTsRestRoutes,
  meta: metaTsRestRoutes,
  fixtures: fixtureTsRestRoutes,
  players: playerTsRestRoutes,
  managers: managerTsRestRoutes,
  calendar: calendarTsRestRoutes,
  places: placeTsRestRoutes,
  awards: awardTsRestRoutes,
  seasons: seasonTsRestRoutes,
  users: userTsRestRoutes,
  game: gameTsRestRoutes,
  transfers: transferTsRestRoutes,
  facilities: facilitiesTsRestRoutes,
  play: playTsRestRoutes,
  editions: editionTsRestRoutes,
  challenges: challengeTsRestRoutes,
  world: worldTsRestRoutes,
  competitionDefinitions: competitionDefinitionTsRestRoutes,
  atlas: atlasTsRestRoutes,
});

// export default mainRouter;

const router = Router();

// Access rules for every contract route, before any of them run.
router.use(routePolicy);

router.use('/files', files);
router.use('/players', playerFace);
router.use('/managers', managerFace);
router.use('/services', services);
router.use('/crests', crestRouter);
router.use('/kits', kitRouter);
router.use('/realtime', realtimeRouter);

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
