import respond from '../../helpers/responseHandler';
import { NextFunction, Request, Response } from 'express';
import {
  getPlayerStats,
  getPlayerById,
  updatePlayerFields,
  incrementAllPlayersAge,
  createMany,
} from './player.service';
import { incrementAllManagersAge } from '../managers/manager.service';
import { newAttributeRatings, generatePlayer } from '../../utils/players';
import { PlayerInterface, IPlayerAttributes } from '../../interfaces/Player';
import { runSpawn } from '../../utils/scripts';
import { titleCase } from '../../helpers/misc';

export function updatePlayersDetails(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { year } = req.params;

  const $getPlayerStats = () => {
    return getPlayerStats(year);
  };

  const updPlayers = (ar: any[]) => {
    const pt = ar.map((_) => updPlayer(_));

    // TODO: Mehn, I don't know how we will do this! Sha for now let's do all PromiseAll
    // Promise.all() has a 2 million limit lol. So we have to do this in batches o
    // while (array.length > 0) {
    //   const n = array.splice(0, 100);

    //   const g = n.map((_) => updPlayer(_));

    //   promises.push(Promise.all(g));
    // }

    return Promise.all(pt);
  };

  const increaseAllPeoplesAge = () => {
    return Promise.all([incrementAllPlayersAge(), incrementAllManagersAge()]);
  };

  const updPlayer = async (data: {
    player_id: string;
    attributes: IPlayerAttributes;
    new_rating: number;
    new_value: number;
    old_rating: number;
    old_value: number;
  }) => {
    const player = await getPlayerById(data.player_id);
    const ratingsHistory = [
      ...(player?.RatingsHistory ?? []),
      {
        date: new Date().toString(),
        year,
        rating: data.new_rating,
        value: data.new_value,
        old_rating: data.old_rating,
        old_value: data.old_value,
      },
    ];

    return updatePlayerFields(data.player_id, {
      Attributes: data.attributes,
      Rating: data.new_rating,
      Value: data.new_value,
      RatingsHistory: ratingsHistory,
    });
  };

  const addAttributes = (agg: Awaited<ReturnType<typeof getPlayerStats>>) => {
    console.log('agg', agg.length);
    const toDo: any[] = [];

    try {
      agg.forEach((p) => {
        if (!p.player) return;
        const player = p.player as unknown as PlayerInterface;
        const { attributes, new_rating, new_value } = newAttributeRatings(
          player,
          p.points
        );
        toDo.push({
          attributes,
          new_rating,
          new_value,
          old_rating: player.Rating,
          old_value: player.Value,
          player_id: p.player._id,
        });
      });

      return toDo;
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  return $getPlayerStats()
    .then(addAttributes)
    .then(updPlayers)
    .then(increaseAllPeoplesAge)
    .then((updates: any) => {
      console.log('Finished updating players! => ', updates);
      return next(); // next, update all clubs
      // return respond.success(res, 200, 'Player details updated successfully');
    })
    .catch((err: any) => {
      console.log('Error updating Player values and ending year! => ', err);
      return respond.fail(res, 400, 'Error updating Player values', err);
    });
}

/** Generate Players */
export function generatePlayers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { number, culture, position } = req.query;

  if (!number || !culture || !position) {
    return respond.fail(
      res,
      400,
      'Provide the number of names, culture, position to generate Players'
    );
  }

  const generatePlayerObjects = (player_names: string) => {
    const names = player_names
      .split('\r\n')
      .filter((x, i) => x || null)
      .map(
        (n) => n.split('__').map((l) => titleCase(l))
        // .join(" ")
      );

    const generated_players = names.map((p) =>
      generatePlayer({
        position: String(position),
        firstname: p[0],
        lastname: p[1],
        nationality: String(culture),
      })
    );

    return generated_players;
  };

  // TODO: finish up by then saving to database
  runSpawn('player_names', ['generate', String(number), 'f_l', String(culture)])
    .then((player_names: unknown) =>
      generatePlayerObjects(player_names as string)
    )
    .then(createMany)
    .then((generated_players: any[]) => {
      return respond.success(
        res,
        200,
        'Players generated successfully!',
        generated_players
      );
    })
    .catch((err: any) => {
      console.log(err);
      return respond.fail(res, 400, 'Error generating Players', err.toString());
    });
}
