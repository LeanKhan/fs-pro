// a function that awards all the awards for that season/year...

import { allPlayerStats } from '../players/player.service';
import { Fixture } from '../fixtures/fixture.model';
import { PlayerInterface } from '../players/player.model';
import { AwardInterface } from './awards.model';
import { createAwards } from '.';
import { getManagers } from '../managers/manager.service';

/** Works out and persists every Award for a finished Season (top player
 * per stat category, plus the winning Manager's title). Plain function
 * (not an Express handler) so it can be called directly from a ts-rest
 * handler - see season.router.ts's finishSeason, which now calls this with
 * the seasonChampions club id computed by finishSeasonPlain (previously
 * threaded through req.body). */
export async function giveSeasonAwards(
  season_id: string,
  seasonChampions: string
) {
  const awards = [
    'most-points',
    'most-goals',
    'most-saves',
    'most-assists',
    'most-tackles',
    'best-eleven',
  ];

  // now for each, get the winner(s) and create the award object.
  // get allPlayerStats
  const allStats = await allPlayerStats(season_id);
  const awardObjects: AwardInterface[] = [];

  awards.forEach((award) => {
    const [superlative, attribute] = award.split('-');

    if (superlative == 'most') {
      // now find out what kind of most...
      allStats.sort((a, b) => {
        return b[attribute] - a[attribute];
      });
    } else {
      return;
    }

    // now return the first player on this list...
    const p = allStats[0].player as PlayerInterface;
    const fixture = allStats[0].fixture as Fixture;

    // create award object for this student
    awardObjects.push(
      createObject(
        'player',
        award,
        p._id as string,
        season_id,
        'season',
        p.ClubId as string
      )
    );
  });

  // create object for Winning Manager...
  const [winningManager] = await getManagers({
    isEmployed: true,
    ClubId: seasonChampions,
  });

  if (winningManager) {
    awardObjects.push({
      Name: 'Season Title',
      Type: 'manager', // club/manager/player
      Category: 'winning-title',
      Period: 'season',
      RecipientId: winningManager._id as string,
      ClubId: seasonChampions, // what club was this manager or player in when this happened?
      Remarks: `${winningManager.FirstName} ${winningManager.LastName} won a title with this club!`,
      SeasonId: season_id,
    });
  }

  return createAwards(awardObjects);
}

function createObject(
  awardType: 'player' | 'manager',
  category: string,
  recipient: string,
  season: string,
  period: 'season' | 'year' | 'all-time',
  club: string
) {
  let remark = '',
    name = '';

  switch (category) {
    case 'most-goals':
      remark = `Golden Boot for ${period}`;
      name = 'Highest Goal Scorer';
      break;
    case 'most-points':
      remark = `Player of the ${period}`;
      name = 'Best Player';
      break;
    case 'most-assists':
      remark = `Most Assists of the ${period}`;
      name = 'Highest Assists';
      break;
    case 'most-tackles':
      remark = `Most Tackles of ${period}`;
      name = 'Highest Tackles';
      break;
    case 'most-saves':
      remark = `Golden Gloves of ${period}`;
      name = 'Most Saves';
      break;
  }

  return {
    Name: name,
    Type: awardType, // club/manager/player
    Category: category,
    Period: period,
    RecipientId: recipient,
    ClubId: club, // what club was this manager or player in when this happened?
    Remarks: remark,
    SeasonId: season,
  };
}
