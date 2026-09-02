import {
  Request,
  Response,
  NextFunction,
  response,
  RequestHandler,
} from 'express';
import respond from '../helpers/responseHandler';
import { toggleSigned, signManyPlayersToClub } from '../controllers/players/player.service';

export const updatePlayerSigning: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let resp;
  if (req.query.remove) {
    resp = await toggleSigned(
      req.body.data.playerId,
      req.body.data.isSigned,
      null,
      null
    );
  } else {
    resp = await toggleSigned(
      req.body.data.playerId,
      req.body.data.isSigned,
      req.body.data.clubCode,
      req.body.data.clubId
    );
  }

  if (resp) {
    next();
  } else {
    respond.fail(res, 400, 'Error adding player to club');
  }
};

export const updateManyPlayerSigning: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { playerIds, clubId, clubCode } = req.body.data;

  try {
    await signManyPlayersToClub(playerIds, clubCode, clubId);
    next();
  } catch (err) {
    respond.fail(res, 400, 'Error adding player to club');
  }
};
