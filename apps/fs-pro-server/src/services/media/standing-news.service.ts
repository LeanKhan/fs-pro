import type { MediaItem } from '@repo/api-contract';
import type { ClubForm } from '../../db/drizzle/schema';
import { formScore } from '../world/club-standing.service';

/**
 * Press coverage of a club's run of results, from its persisted Form and
 * standing (world/club-standing.service.ts). Works on the PLAY loop, which
 * has no season for the fixture-preview stories to read. Purely local.
 */
export function generateStandingNews(params: {
  club: {
    ClubCode: string;
    Name: string;
    Form: ClubForm | null;
    Fans: number;
    BoardConfidence: number;
  } | null;
  formattedDate: string;
}): MediaItem[] {
  const { club, formattedDate } = params;
  const streak = club?.Form?.streak;
  if (!club || !streak || streak.type === 'D' || streak.length < 3) return [];

  const recent = (club.Form?.recent ?? []).slice(0, 5).join(' ');
  const n = streak.length;
  const losing = streak.type === 'L';
  const board =
    club.BoardConfidence < 20
      ? 'The board is said to be reviewing the manager’s position.'
      : club.BoardConfidence < 35
        ? 'Sources close to the board describe the mood as “concerned”.'
        : club.BoardConfidence >= 80
          ? 'The boardroom is said to be delighted.'
          : null;

  return [
    {
      id: `standing-${club.ClubCode}-${streak.type}${n}`,
      type: 'news',
      category: 'club_press',
      badge: losing ? '📉 CRISIS WATCH' : '🔥 ON FIRE',
      badgeColor: losing ? 'error' : 'success',
      title: losing
        ? n >= 5
          ? `${club.Name} in freefall: ${n} defeats in a row`
          : `${club.Name} slump to ${n} straight defeats`
        : n >= 5
          ? `Unstoppable ${club.Name} make it ${n} wins in a row`
          : `${club.Name} on a roll: ${n} wins on the bounce`,
      subtitle: `Form: ${recent} • ${formattedDate}`,
      summary: losing
        ? `Supporters are voting with their feet as ${club.Name}'s run goes on. ${board ?? 'Pressure is mounting.'}`
        : `${club.Name} have ${club.Fans.toLocaleString()} supporters and counting, and crowds are growing with every win. ${board ?? ''}`.trim(),
      bulletPoints: [
        `Last five: ${recent}.`,
        `Fanbase: ${club.Fans.toLocaleString()}.`,
        `Form rating: ${formScore(club.Form) >= 0 ? '+' : ''}${Math.round(formScore(club.Form) * 100)}.`,
        ...(board ? [board] : []),
      ],
      timestamp: new Date().toISOString(),
      hypeScore: Math.min(n + 2, 10),
    },
  ];
}
