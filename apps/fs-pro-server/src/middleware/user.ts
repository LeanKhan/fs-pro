import { Request, Response, NextFunction, RequestHandler } from 'express';
import responseHandler from '../helpers/responseHandler';
import { store } from '../sessionStore';

/**
 * checkSession
 *
 * Check if session exists...
 *
 * @param req
 * @param res
 * @param next
 */
export const checkSession: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session!.socketID) {
    const sessionID = req.sessionID as string;

    store.get(sessionID, (err: any, session: any) => {
      if (session) {
        return responseHandler.success(res, 200, 'Authenticated successfully', {
          sessionExists: true,
          user: { userID: (req.session as any).userID, sessionID },
        });
      } else {
        //  if session is expired or something, go to the next middleware...
        //  the next one checks if the client sent any session object

        return next();
      }
    });
  } else {
    //   If the request does not have any session object attached move to next middleware...
    return next();
  }
};
