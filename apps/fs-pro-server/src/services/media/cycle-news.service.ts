import type { MediaItem } from '@repo/api-contract';
import { listSeasonReports } from '../world/season-report.service';
import { and, eq, gt, sql } from 'drizzle-orm';
import { fixtures } from '../../db/drizzle/schema';
import { pick } from './story-angles.service';

/** Cycle news is fresh only for the first matchdays of the new cycle. */
const FRESH_FOR_MATCHDAYS = 2;

/**
 * News built from the latest season-cycle report: promotions, relegations,
 * champions and breakout players. Without this the media hub only ever
 * described the current competition, so a club that moved divisions got no
 * coverage of the move. Purely local - no Jev.
 */
export async function generateCycleNews(params: {
  db: any;
  club: { id: string; ClubCode: string; Name: string } | null;
  formattedDate: string;
  isMyClubChannel: boolean;
}): Promise<MediaItem[]> {
  const { db, club, formattedDate, isMyClubChannel } = params;
  const reports = await listSeasonReports();
  const report = reports[0];
  if (!report) return [];

  // Once a couple of matchdays of the new cycle have been played, this is old news.
  const [{ days }] = await db
    .select({ days: sql<number>`count(distinct ${fixtures.ScheduledDay})` })
    .from(fixtures)
    .where(and(eq(fixtures.Played, true), gt(fixtures.PlayedAt, new Date(report.generatedAt))));
  if (Number(days) >= FRESH_FOR_MATCHDAYS) return [];

  const items: MediaItem[] = [];
  const nameOf = (code: string) => report.competitions.find((c) => c.code === code)?.name ?? code;
  const seed = `${report.year}:${club?.ClubCode ?? 'x'}`;
  const s = (salt: string, list: string[]) => pick(seed, salt, list);

  // 1. The viewer's own club: promoted or relegated.
  const move = club ? report.movements.find((m) => m.clubCode === club.ClubCode) : undefined;
  if (move && club && isMyClubChannel) {
    const up = move.direction === 'promoted';
    const from = nameOf(move.from);
    const to = nameOf(move.to);
    const champion = report.competitions.find(
      (c) => c.code === move.from && c.championCode === club.ClubCode
    );
    const alongside = report.movements
      .filter((m) => m.direction === move.direction && m.to === move.to && m.clubCode !== club.ClubCode)
      .map((m) => m.clubName);

    const title = up
      ? s('t', [
          `${club.Name} Promoted to the ${to}!`,
          `Going Up: ${club.Name} Earn a Place in the ${to}`,
          `${club.Name} Celebrate Promotion From the ${from}`,
        ])
      : s('t', [
          `${club.Name} Relegated to the ${to}`,
          `Drop Confirmed: ${club.Name} Head Down to the ${to}`,
          `${club.Name} Face the ${to} After Relegation`,
        ]);
    const summary = up
      ? `${club.Name} have been promoted from the ${from} to the ${to}${champion ? ', doing it as champions' : ''}. ${
          alongside.length ? `They go up with ${alongside.join(' and ')}. ` : ''
        }Next season brings tougher opposition and bigger prizes.`
      : `${club.Name} have been relegated from the ${from} to the ${to}. ${
          alongside.length ? `${alongside.join(' and ')} go down with them. ` : ''
        }The board now has a season to rebuild and plan a return.`;
    const quote = up
      ? s('q', [
          `This is what we worked for. The step up is big, and we're going to be ready for it.`,
          `Promotion belongs to the players and the supporters. Now we prepare for a harder league.`,
        ])
      : s('q', [
          `It hurts, and I won't dress it up. We rebuild and we come back stronger.`,
          `Relegation is painful for everyone here. The response has to be immediate and honest.`,
        ]);

    items.push({
      id: `cycle-move-${report.year}-${club.ClubCode}`,
      type: 'news',
      category: 'general',
      badge: up ? '⬆️ PROMOTION' : '⬇️ RELEGATION',
      badgeColor: up ? 'success' : 'error',
      title,
      subtitle: `${from} → ${to} • ${report.year} Season Review`,
      summary,
      bulletPoints: [
        `${up ? 'Promoted' : 'Relegated'}: ${from} → ${to}.`,
        ...(champion ? [`League champions of the ${from}.`] : []),
        ...(alongside.length ? [`${up ? 'Going up' : 'Going down'} too: ${alongside.join(', ')}.`] : []),
        up
          ? `Next: a step up in quality - the transfer window is the time to strengthen.`
          : `Next: rebuild - review wages and squad depth in the transfer window.`,
      ],
      fullStory: `${summary}\n\n${
        up
          ? 'Expect prize money and attention to rise with the division, along with the demands on the squad.'
          : 'With the drop comes lower prize money, so squad and wage decisions matter more this window.'
      }`,
      quote: { author: `${club.Name} Manager`, role: 'Post-Season Interview', text: quote },
      hero: {
        format: 'poster',
        bannerTheme: up ? 'champion_gold' : 'press_dark',
        homeCode: club.ClubCode,
        caption: `${club.Name}: ${up ? 'promoted to' : 'relegated to'} the ${to}`,
      },
      actions: [
        {
          label: 'Transfer Market',
          action: 'view_transfers',
          to: '/transfers',
          icon: 'mdi-swap-horizontal',
          color: up ? 'success' : 'primary',
        },
      ],
      timestamp: formattedDate,
      hypeScore: up ? 5 : 4,
    });
  }

  // 2. Movement round-up across the leagues.
  if (report.movements.length) {
    const ups = report.movements.filter((m) => m.direction === 'promoted');
    const downs = report.movements.filter((m) => m.direction === 'relegated');
    const line = (m: (typeof report.movements)[number]) =>
      `${m.clubName} (${m.clubCode}): ${nameOf(m.from)} → ${nameOf(m.to)}`;
    items.push({
      id: `cycle-movements-${report.year}`,
      type: 'news',
      category: 'general',
      badge: '🔁 PROMOTION & RELEGATION',
      badgeColor: 'amber-accent-4',
      title: `${report.year} Review: ${ups.length} Promoted, ${downs.length} Relegated`,
      subtitle: `Movement across the divisions`,
      summary: `${ups.length} club${ups.length === 1 ? '' : 's'} moved up and ${downs.length} moved down as the ${report.year} cycle closed.`,
      bulletPoints: [
        ...ups.slice(0, 5).map((m) => `⬆️ ${line(m)}`),
        ...downs.slice(0, 5).map((m) => `⬇️ ${line(m)}`),
      ],
      hero: { format: 'season_recap', bannerTheme: 'classic_gold' },
      timestamp: formattedDate,
      hypeScore: 3,
    });
  }

  // 3. Champions and standout individuals (own club first).
  const champs = report.competitions.filter((c) => c.kind === 'league' && c.championName);
  const isOwn = (h: { clubCode?: string | null }) => Boolean(club && h.clubCode === club.ClubCode);
  const relevant = report.highlights.filter((h) => isOwn(h) || h.importance >= 90);
  const shown = [...relevant.filter(isOwn), ...relevant.filter((h) => !isOwn(h))].slice(0, 5);
  if (champs.length || shown.length) {
    items.push({
      id: `cycle-highlights-${report.year}`,
      type: 'news',
      category: 'general',
      badge: '📰 SEASON HIGHLIGHTS',
      badgeColor: 'deep-purple-accent-2',
      title: `${report.year} Season in Review`,
      subtitle: 'Champions and standout players',
      summary: champs.length
        ? `${champs.map((c) => `${c.championName} (${c.name})`).slice(0, 3).join(', ')} finished on top.`
        : `The biggest storylines from the ${report.year} cycle.`,
      bulletPoints: [
        ...champs.map((c) => `🏆 ${c.name} (tier ${c.division || 1}): ${c.championName}`),
        ...shown.map((h) => `${h.title}: ${h.detail}`),
      ].slice(0, 8),
      hero: { format: 'poster', bannerTheme: 'press_dark', caption: `${report.year} season review` },
      timestamp: formattedDate,
      hypeScore: 3,
    });
  }

  return items;
}
