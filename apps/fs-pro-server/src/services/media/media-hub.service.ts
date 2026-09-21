import { desc, eq, sql, or, like } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  clubs,
  fixtures,
  calendars,
  seasons,
  competitions,
  transferLedger,
} from '../../db/drizzle/schema';
import type { MediaItem } from '@repo/api-contract';
import { DerbyDetectorService, DerbyContext } from '../ai/derby-detector.service';
import { JevService, ScoreAnswer } from '../ai/jev.service';
import { compileStandings } from '../../utils/seasons';

const COMPETITION_NAMES: Record<string, string> = {
  EBSL: 'Epson Bellean Second League',
  EFL: 'Bellean First League',
  KLV: 'Kev Leega Vista',
  KLS: 'Kev Leega Seconda',
  CCL: 'Continental Champions League',
  'FAC-BELL': 'Bellean Association Cup',
  'FAC-KEV': 'Kev Association Cup',
};

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export class MediaHubService {
  public static async getMediaFeed(params: {
    clubId: string;
    fixtureId?: string;
    competitionCode?: string;
    channel?: string;
  }): Promise<MediaItem[]> {
    const dz = DrizzleDatabase.getInstance();
    const db = dz.database;

    // 1. Current calendar
    const calendarRow = await db.query.calendars.findFirst();
    const currentDay = calendarRow?.CurrentDay ?? 1;
    const formattedDate = calendarRow?.CurrentDate
      ? new Date(calendarRow.CurrentDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : `Day ${currentDay}`;

    // 2. Fetch User Club
    const currentClub = await db.query.clubs.findFirst({
      where: eq(clubs.id, params.clubId),
    });

    // 3. Resolve Target Channel / Competition
    const selectedChannel = params.channel || 'MY_CLUB';

    // === CHANNEL: OVERSEAS DISPATCH ===
    if (selectedChannel === 'OVERSEAS') {
      return MediaHubService.generateOverseasFeed(formattedDate, currentDay);
    }

    // Determine target competition code (e.g. EBSL, EFL, KLV, KLS, CCL)
    let targetCompCode = 'EBSL';
    if (selectedChannel !== 'MY_CLUB') {
      targetCompCode = selectedChannel.toUpperCase();
    } else if (params.competitionCode) {
      targetCompCode = params.competitionCode.toUpperCase();
    } else if (currentClub) {
      const sampleFix = await db.query.fixtures.findFirst({
        where: sql`("HomeTeamId" = ${currentClub.id} OR "AwayTeamId" = ${currentClub.id}) AND "LeagueCode" IS NOT NULL`,
      });
      if (sampleFix?.LeagueCode) {
        targetCompCode = sampleFix.LeagueCode.toUpperCase();
      }
    }

    const compDisplayName = COMPETITION_NAMES[targetCompCode] || targetCompCode;

    // 4. Fetch the most recent season for this competition
    const seasonList = await db.query.seasons.findMany({
      where: or(
        eq(seasons.CompetitionCode, targetCompCode),
        like(seasons.SeasonCode, `%${targetCompCode}%`)
      ),
      orderBy: [desc(seasons.createdAt)],
      limit: 5,
    });

    const targetSeason = seasonList[0];

    // Check whether this season is completed/finished
    let isSeasonConcluded = false;
    let seasonFixtures: any[] = [];
    if (targetSeason) {
      seasonFixtures = await db.query.fixtures.findMany({
        where: eq(fixtures.SeasonId, targetSeason.id),
      });
      const isAllPlayed =
        seasonFixtures.length > 0 && seasonFixtures.every((f) => f.Played);
      isSeasonConcluded =
        targetSeason.isFinished === true ||
        targetSeason.Status === 'ended' ||
        targetSeason.Status === 'completed' ||
        isAllPlayed;
    }

    // === CASE 1: SEASON CONCLUDED -> BROADCAST SEASON FINALE & CHAMPIONS ===
    if (
      isSeasonConcluded &&
      targetSeason &&
      Array.isArray(targetSeason.Standings) &&
      targetSeason.Standings.length > 0
    ) {
      return MediaHubService.generateSeasonFinaleFeed({
        db,
        targetSeason,
        targetCompCode,
        compDisplayName,
        currentClub,
        formattedDate,
        isMyClubChannel: selectedChannel === 'MY_CLUB',
      });
    }

    // === CASE 2: ACTIVE SEASON IN PROGRESS ===
    return MediaHubService.generateActiveSeasonFeed({
      db,
      params,
      currentClub,
      targetSeason,
      targetCompCode,
      compDisplayName,
      formattedDate,
      currentDay,
      seasonFixtures,
      isMyClubChannel: selectedChannel === 'MY_CLUB',
    });
  }

  /**
   * Generates the Season Finale package when a league campaign has concluded,
   * including final standings, champion coronation, post-mortem, and transfer wire moves.
   */
  private static async generateSeasonFinaleFeed(ctx: {
    db: any;
    targetSeason: any;
    targetCompCode: string;
    compDisplayName: string;
    currentClub: any;
    formattedDate: string;
    isMyClubChannel: boolean;
  }): Promise<MediaItem[]> {
    const {
      db,
      targetSeason,
      compDisplayName,
      currentClub,
      formattedDate,
      isMyClubChannel,
    } = ctx;

    const compiled = compileStandings(targetSeason.Standings as any);
    if (!compiled || compiled.length === 0) {
      return [];
    }

    const championRow = compiled[0];
    const championClub = await db.query.clubs.findFirst({
      where: or(
        eq(clubs.id, championRow.ClubID),
        eq(clubs.ClubCode, championRow.ClubCode)
      ),
    });
    const championName = championClub?.Name ?? championRow.ClubCode;

    const runnerUpRow = compiled[1];
    const runnerUpClub = runnerUpRow
      ? await db.query.clubs.findFirst({
          where: or(
            eq(clubs.id, runnerUpRow.ClubID),
            eq(clubs.ClubCode, runnerUpRow.ClubCode)
          ),
        })
      : null;
    const runnerUpName = runnerUpClub?.Name ?? runnerUpRow?.ClubCode ?? 'Runner-Up';

    const bottomRow = compiled[compiled.length - 1];
    const bottomClub = bottomRow
      ? await db.query.clubs.findFirst({
          where: or(
            eq(clubs.id, bottomRow.ClubID),
            eq(clubs.ClubCode, bottomRow.ClubCode)
          ),
        })
      : null;
    const bottomName = bottomClub?.Name ?? bottomRow?.ClubCode ?? 'Bottom Club';

    // Find User Club rank in this competition
    const userRankIdx = compiled.findIndex(
      (r) =>
        (currentClub && r.ClubID === currentClub.id) ||
        (currentClub && r.ClubCode === currentClub.ClubCode)
    );
    const userRank = userRankIdx >= 0 ? userRankIdx + 1 : null;
    const userRow = userRankIdx >= 0 ? compiled[userRankIdx] : null;

    const items: MediaItem[] = [];
    const seasonYear = targetSeason.Year || '2027';
    const isUserChampion = userRank === 1;

    // 1. HERO: CROWNED CHAMPIONS (format: 'season_champions')
    const bulletPoints = [
      `🥇 Champion: ${championName} (${championRow.ClubCode}) finish 1st with ${championRow.Points} pts (${championRow.Wins}W, ${championRow.Draws}D, ${championRow.Losses}L | GD: ${championRow.GD >= 0 ? '+' : ''}${championRow.GD})`,
    ];

    if (userRank && currentClub) {
      bulletPoints.push(
        `📊 Your Finish: ${currentClub.Name} (${currentClub.ClubCode}) finish ${getOrdinal(userRank)} of ${compiled.length} with ${userRow?.Points ?? 0} pts (${userRow?.Wins ?? 0}W, ${userRow?.Draws ?? 0}D, ${userRow?.Losses ?? 0}L)`
      );
    }

    if (runnerUpRow) {
      bulletPoints.push(
        `🥈 Promotion / Runner-Up: ${runnerUpName} (${runnerUpRow.ClubCode}) finish 2nd with ${runnerUpRow.Points} pts`
      );
    }

    if (bottomRow && bottomRow.ClubCode !== championRow.ClubCode) {
      bulletPoints.push(
        `🔻 Drop Zone: ${bottomName} (${bottomRow.ClubCode}) finish at the base of the table with ${bottomRow.Points} pts`
      );
    }

    items.push({
      id: `season-finale-${targetSeason.id}`,
      type: 'news',
      category: 'general',
      badge: '🏆 SEASON FINALE & CHAMPIONS',
      badgeColor: 'amber-accent-4',
      title: `${compDisplayName} Season Finale: ${championName} Crowned Champions!`,
      subtitle: `Official Final Classifications • ${seasonYear} Campaign Concluded`,
      summary: isUserChampion
        ? `Incredible scenes as ${currentClub?.Name} lift the trophy! After ${championRow.Played} matchdays of unrelenting determination, the title is officially ours!`
        : `The curtain comes down on the ${compDisplayName} campaign! ${championName} have officially secured the championship title with ${championRow.Points} points across ${championRow.Played} matchdays in an unforgettable season finale.`,
      bulletPoints,
      fullStory: `The ${compDisplayName} season has officially reached its conclusion, crowning ${championName} as champions after ${championRow.Played} matchdays of unrelenting tactical combat.\n\nFrom opening day optimism through grueling winter fixture congestion, this campaign pushed every squad to its physical and strategic limits. ${championName} demonstrated remarkable consistency, securing top honors with ${championRow.Points} points.\n\nWith promotion tickets punched, survival battles resolved, and final prize allocations distributed, all eyes now turn toward the transfer market as managers prepare for the upcoming campaign cycle.`,
      quote: {
        author: `${championName} Captain`,
        role: 'Championship Winning Captain',
        text: 'This title is the culmination of relentless sacrifice, tactical discipline, and the unconditional belief of our supporters. Every single point was earned through blood, sweat, and team spirit.',
      },
      hero: {
        format: 'season_champions',
        championCode: championRow.ClubCode,
        championName,
        championPoints: championRow.Points,
        championGoalDiff: championRow.GD,
        userClubRank: userRank ?? undefined,
        userClubCode: currentClub?.ClubCode,
        totalTeams: compiled.length,
        competitionName: compDisplayName,
        seasonCode: targetSeason.SeasonCode,
        bannerTheme: 'champion_gold',
      },
      actions: [
        {
          label: 'View Final Standings',
          action: 'view_standings',
          to: '/league',
          icon: 'mdi-trophy',
          color: 'amber-accent-4',
        },
        {
          label: 'Read Full Story',
          action: 'open_story',
          icon: 'mdi-book-open-page-variant-outline',
          color: 'primary',
        },
      ],
      timestamp: formattedDate,
      hypeScore: 5,
    });

    // 2. RECENT CONFIRMED TRANSFERS (Transfer Wire)
    const transferNews = await MediaHubService.generateTransferNewsItems(
      db,
      formattedDate
    );
    if (transferNews.length > 0) {
      items.push(...transferNews);
    }

    // 3. VIDEO: SEASON IN REVIEW REEL
    items.push({
      id: `season-recap-video-${targetSeason.id}`,
      type: 'video',
      category: 'general',
      badge: '🎬 SEASON IN REVIEW',
      badgeColor: 'red-accent-3',
      title: `${compDisplayName} Season Highlights: The Triumphs & Defining Moments`,
      subtitle: `Official League Highlights Broadcast • 1080p Stream`,
      summary: `Relive the most spectacular strikes, stoppage-time heartstoppers, crunching rivalry tackles, and trophy celebrations from the entire ${seasonYear} campaign.`,
      hero: {
        format: 'video_player',
        videoDuration: '3:45',
        homeCode: championRow.ClubCode,
        awayCode: runnerUpRow?.ClubCode,
        bannerTheme: 'derby_fire',
      },
      actions: [
        {
          label: 'Watch Highlights',
          action: 'play_video',
          icon: 'mdi-play-circle',
          color: 'red-accent-3',
        },
      ],
      timestamp: formattedDate,
      hypeScore: 5,
    });

    // 4. NEWS: EXECUTIVE POST-MORTEM & PRESS BRIEFING
    const postMortemTitle = userRank && currentClub
      ? `${currentClub.Name}: Board Reviews Campaign Performance`
      : `${championName} Celebrates Historic Championship Triumph`;

    const postMortemSummary = userRank && currentClub
      ? `Following a hard-fought campaign culminating in a ${getOrdinal(userRank)}-place finish with ${userRow?.Points ?? 0} points, the board of ${currentClub.Name} expressed appreciation for squad commitment while outlining strategic targets for the upcoming transfer window.`
      : `Supporters poured into city plazas and the club grounds to celebrate ${championName}'s memorable league title after an arduous and thrilling campaign.`;

    items.push({
      id: `season-press-${targetSeason.id}`,
      type: 'news',
      category: 'club_press',
      badge: '📰 EXECUTIVE POST-MORTEM',
      badgeColor: 'deep-purple-accent-2',
      title: postMortemTitle,
      subtitle: `Ivania Sports Gazette • Season Wrap-up`,
      summary: postMortemSummary,
      bulletPoints: [
        `Squad Reflection: Key areas of strength identified alongside depth needs for next season.`,
        `Transfer Ambitions: Scouting department actively monitoring domestic and overseas talent.`,
        `Supporter Backing: Season ticket renewals open ahead of the upcoming campaign cycle.`,
      ],
      fullStory: `In a comprehensive post-season boardroom address, club directors and sporting leadership conducted a detailed audit of on-pitch results, financial health, and squad readiness.\n\nWith player contracts, wage structures, and upcoming tournament qualifications under review, the technical staff confirmed that targeted transfer bids are being prepared to address specific tactical needs before the next competitive cycle begins.`,
      quote: {
        author: currentClub?.Name ?? 'Boardroom Directorate',
        role: 'Official Club Statement',
        text: 'Every season teaches valuable lessons. We have established solid foundations, and our priority now is aggressive recruitment to ensure we take the next competitive leap.',
      },
      hero: {
        format: 'poster',
        bannerTheme: 'press_dark',
        caption: 'Official End-of-Season Press Briefing',
      },
      actions: [
        {
          label: 'Read Statement',
          action: 'open_story',
          icon: 'mdi-file-document-outline',
          color: 'deep-purple-accent-2',
        },
      ],
      timestamp: formattedDate,
      hypeScore: 4,
    });

    // 5. PICTURE: TROPHY PRESENTATION
    items.push({
      id: `season-trophy-photo-${targetSeason.id}`,
      type: 'picture',
      category: 'matchday',
      badge: '📸 TROPHY LIFT',
      badgeColor: 'teal-accent-4',
      title: `${championName} Hoist the ${compDisplayName} Trophy`,
      subtitle: `Post-Match Ceremony & Confetti Shower`,
      summary: `Gold confetti rained down as the championship trophy was held aloft to roaring applause and pyrotechnics celebrating the culmination of the season.`,
      hero: {
        format: 'photo',
        stadiumName: 'League Trophy Podium',
        bannerTheme: 'classic_gold',
        caption: 'Championship celebration and podium presentation',
      },
      actions: [
        {
          label: 'View Photo Story',
          action: 'open_story',
          icon: 'mdi-image-outline',
          color: 'teal-accent-4',
        },
      ],
      timestamp: formattedDate,
      hypeScore: 5,
    });

    // 6. CLUB COMMERCIAL & SQUAD MEDIA (If User Club is viewed)
    if (isMyClubChannel && currentClub) {
      items.push({
        id: `commercial-${currentClub.id}`,
        type: 'promo',
        category: 'commercial',
        badge: '✨ SEASON CAMPAIGN',
        badgeColor: 'cyan-accent-3',
        title: `${currentClub.Name}: Commemorative Season Merchandise`,
        subtitle: `Official Club Megastore`,
        summary: `Celebrate the campaign with official season commemorative kits, badges, and supporter memorabilia now available in the club store.`,
        bulletPoints: [
          `Special Edition: Commemorative jerseys with official league sleeve badges.`,
          `Academy Benefit: Percentage of merchandise revenue reinvested into youth development.`,
        ],
        hero: {
          format: 'poster',
          bannerTheme: 'classic_gold',
          homeCode: currentClub.ClubCode ?? 'CLUB',
          caption: 'Official Club Commemorative Range',
        },
        timestamp: formattedDate,
        hypeScore: 3,
      });
    }

    return items;
  }

  /**
   * Generates the active in-progress matchday / derby / club feed,
   * enriched with recent confirmed transfers.
   */
  private static async generateActiveSeasonFeed(ctx: {
    db: any;
    params: { clubId: string; fixtureId?: string };
    currentClub: any;
    targetSeason: any;
    targetCompCode: string;
    compDisplayName: string;
    formattedDate: string;
    currentDay: number;
    seasonFixtures: any[];
    isMyClubChannel: boolean;
  }): Promise<MediaItem[]> {
    const {
      db,
      params,
      currentClub,
      targetSeason,
      compDisplayName,
      formattedDate,
      currentDay,
      isMyClubChannel,
    } = ctx;

    // Resolve Active Fixture
    let activeFixture: any = null;
    if (params.fixtureId) {
      activeFixture = await db.query.fixtures.findFirst({
        where: eq(fixtures.id, params.fixtureId),
        with: { homeTeam: true, awayTeam: true },
      });
    }

    if (!activeFixture && isMyClubChannel && currentClub) {
      activeFixture = await db.query.fixtures.findFirst({
        where: sql`("HomeTeamId" = ${currentClub.id} OR "AwayTeamId" = ${currentClub.id}) AND "Played" = false`,
        orderBy: [fixtures.ScheduledDay],
        with: { homeTeam: true, awayTeam: true },
      });
    }

    if (!activeFixture && targetSeason) {
      activeFixture = await db.query.fixtures.findFirst({
        where: sql`"SeasonId" = ${targetSeason.id} AND "Played" = false`,
        orderBy: [fixtures.ScheduledDay],
        with: { homeTeam: true, awayTeam: true },
      });
    }

    // Detect Derby or Special Matchday Event
    let derbyContext: DerbyContext | null = null;
    if (activeFixture?.homeTeam && activeFixture?.awayTeam) {
      derbyContext = DerbyDetectorService.detect(
        activeFixture.homeTeam,
        activeFixture.awayTeam
      );
    }

    const isDerby = Boolean(derbyContext?.isSpecialEvent);
    const jevResponse = await JevService.ask(
      {
        isDerby,
        isTopClash: derbyContext?.eventType === 'title_decider',
        clubCode: currentClub?.ClubCode ?? 'CLUB',
      },
      {
        hypeScore: {
          type: 'score',
          instructions: 'Rate the matchday excitement and media buzz.',
          criteria: ['quiet', 'routine', 'buzzing', 'high_anticipation', 'fever_pitch'],
        },
      }
    );

    const hypeAnswer = jevResponse.answers.hypeScore as ScoreAnswer;
    const hypeScore = derbyContext?.hypeScore ?? (hypeAnswer?.score ? hypeAnswer.score + 1 : 3);

    const items: MediaItem[] = [];

    // --- DERBY / SPECIAL EVENT SPOTLIGHT ---
    if (isDerby && activeFixture && derbyContext) {
      const homeName = activeFixture.homeTeam?.Name ?? activeFixture.Home;
      const awayName = activeFixture.awayTeam?.Name ?? activeFixture.Away;
      const stadium = activeFixture.Stadium || activeFixture.homeTeam?.Stadium?.Name || 'Match Venue';

      items.push({
        id: `promo-derby-${activeFixture.id}`,
        type: 'promo',
        category: 'derby',
        badge: derbyContext.eventTag,
        badgeColor: 'amber-accent-4',
        title: `${derbyContext.eventName}: The Clash for Supremacy`,
        subtitle: `${stadium} • ${activeFixture.LeagueCode || compDisplayName} • Day ${activeFixture.ScheduledDay || currentDay}`,
        summary: derbyContext.description,
        bulletPoints: [
          `Local Pride: Cross-town bragging rights and cultural dominance in ${derbyContext.city || 'the region'} on the line.`,
          `Capacity Crowd: High-voltage atmosphere expected with tickets fully allocated.`,
          `Tactical Warfare: Both managers under intense fan scrutiny to seize victory.`,
        ],
        fullStory: `One of the most fiercely contested derbies in football returns to center stage as ${homeName} and ${awayName} clash at ${stadium}.\n\nTensions have reached fever pitch in the build-up to kickoff. With both tactical systems clashing in midfield and bragging rights deeply felt across the city, managers have spent the entire training week drilling high-press triggers and set-piece routines.`,
        hero: {
          format: 'derby_faceoff',
          homeCode: activeFixture.Home,
          awayCode: activeFixture.Away,
          homeName,
          awayName,
          stadiumName: stadium,
          bannerTheme: 'derby_fire',
        },
        actions: [
          {
            label: activeFixture.Played ? 'Match Review' : 'Play / Simulate Match',
            action: 'match_center',
            to: `/matchzone/${activeFixture.id}`,
            icon: 'mdi-play',
            color: 'amber-accent-4',
          },
          {
            label: 'Read Preview',
            action: 'open_story',
            icon: 'mdi-book-open-outline',
            color: 'primary',
          },
        ],
        timestamp: formattedDate,
        hypeScore,
      });

      items.push({
        id: `news-derby-${activeFixture.id}`,
        type: 'news',
        category: 'derby',
        badge: '📰 MATCHDAY BRIEFING',
        badgeColor: 'deep-purple-accent-2',
        title: `Press Conference: The Stakes Ahead of ${derbyContext.eventName}`,
        subtitle: `Ivania Sports Gazette • Matchday Press Room`,
        summary: `Both managers took to the microphones ahead of the rivalry clash, emphasizing tactical discipline, composure under pressure, and the immense weight of supporter expectations.`,
        bulletPoints: [
          `Home Strategy: Fast direct progression through midfield channels.`,
          `Away Counter: High pressing block aiming to disrupt buildup tempo.`,
          `Key Duel: Midfield battle expected to dictate the tempo of play.`,
        ],
        hero: {
          format: 'poster',
          bannerTheme: 'press_dark',
          caption: 'Dugout tactical preparation ahead of kickoff',
        },
        actions: [
          {
            label: 'Read Story',
            action: 'open_story',
            icon: 'mdi-newspaper-variant-outline',
            color: 'deep-purple-accent-2',
          },
        ],
        timestamp: formattedDate,
        hypeScore,
      });
    } else if (activeFixture) {
      // General Matchday Preview
      const homeName = activeFixture.homeTeam?.Name ?? activeFixture.Home;
      const awayName = activeFixture.awayTeam?.Name ?? activeFixture.Away;
      const stadium = activeFixture.Stadium || 'League Arena';

      items.push({
        id: `promo-match-${activeFixture.id}`,
        type: 'promo',
        category: 'matchday',
        badge: '⚽ MATCHDAY SPOTLIGHT',
        badgeColor: 'primary',
        title: `${homeName} vs ${awayName}`,
        subtitle: `${stadium} • ${compDisplayName} • Day ${activeFixture.ScheduledDay || currentDay}`,
        summary: `${homeName} host ${awayName} in a pivotal fixture with both clubs seeking three crucial league points.`,
        bulletPoints: [
          `Form Check: Crucial test of momentum for the starting XI.`,
          `Tactical Matchup: Balancing offensive class against defensive structure.`,
        ],
        hero: {
          format: 'crest_clash',
          homeCode: activeFixture.Home,
          awayCode: activeFixture.Away,
          homeName,
          awayName,
          stadiumName: stadium,
          bannerTheme: 'classic_gold',
        },
        actions: [
          {
            label: activeFixture.Played ? 'Match Review' : 'Play Match',
            action: 'match_center',
            to: `/matchzone/${activeFixture.id}`,
            icon: 'mdi-play',
            color: 'primary',
          },
          {
            label: 'Match Dossier',
            action: 'open_story',
            icon: 'mdi-book-open-outline',
            color: 'teal-accent-4',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 3,
      });
    }

    // --- RECENT CONFIRMED TRANSFERS ---
    const transferNews = await MediaHubService.generateTransferNewsItems(
      db,
      formattedDate
    );
    if (transferNews.length > 0) {
      items.push(...transferNews);
    }

    // Club Commercial & Squad Media if user club
    if (isMyClubChannel && currentClub) {
      items.push({
        id: `commercial-${currentClub.id}`,
        type: 'promo',
        category: 'commercial',
        badge: '✨ CLUB CAMPAIGN',
        badgeColor: 'cyan-accent-3',
        title: `${currentClub.Name}: New Commercial Partnership`,
        subtitle: `Executive Commercial Office`,
        summary: `The commercial arm of ${currentClub.Name} has finalized an expanded sponsorship portfolio, reinforcing club balance sheets for the current season cycle.`,
        bulletPoints: [
          `Financial Injection: Bolstering training facility investments and academy operations.`,
          `Merchandise Launch: New official home and away kits available for supporters.`,
        ],
        hero: {
          format: 'poster',
          bannerTheme: 'classic_gold',
          homeCode: currentClub.ClubCode ?? 'CLUB',
          caption: 'Official Club Announcement',
        },
        actions: [
          {
            label: 'View Briefing',
            action: 'open_story',
            icon: 'mdi-bullhorn-outline',
            color: 'cyan-accent-3',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 2,
      });
    }

    return items;
  }

  /**
   * Generates rich, detailed transfer news cards from recent TransferLedger records.
   * Every card is equipped with structured `transferDetails` (where from, where to, fee, player specs, quotes).
   */
  private static async generateTransferNewsItems(
    db: any,
    formattedDate: string
  ): Promise<MediaItem[]> {
    const recentTransfers = await db.query.transferLedger.findMany({
      where: eq(transferLedger.Type, 'transfer'),
      orderBy: [desc(transferLedger.createdAt)],
      limit: 3,
      with: {
        player: true,
        buyerClub: true,
        sellerClub: true,
      },
    });

    const items: MediaItem[] = [];

    for (const t of recentTransfers) {
      if (!t.player || !t.buyerClub) continue;
      const player = t.player;
      const buyer = t.buyerClub;
      const seller = t.sellerClub;
      const fee = t.Amount;
      const isFreeAgent =
        !seller ||
        t.Note?.includes('free-agent') ||
        t.Note?.includes('need signing');

      const fromOrigin = seller
        ? `${seller.Name} (${seller.ClubCode})`
        : t.Note?.includes('foreign') || t.Note?.includes('Overseas')
        ? 'Overseas Free Agency'
        : 'Domestic Free Agency';

      const toDestination = `${buyer.Name} (${buyer.ClubCode})`;
      const dealType = isFreeAgent
        ? 'Free Agent Contract'
        : 'Permanent Club Transfer';
      const formattedFee =
        fee > 0 ? `€${fee.toLocaleString()}` : 'Free Transfer';
      const playerName = `${player.FirstName} ${player.LastName}`;
      const rating = Math.round(player.Rating || 70);

      items.push({
        id: `transfer-news-${t.id}`,
        type: 'news',
        category: 'transfer',
        badge: isFreeAgent ? '⚡ FREE AGENT SIGNING' : '💰 CONFIRMED TRANSFER',
        badgeColor: isFreeAgent ? 'light-blue-accent-3' : 'teal-accent-4',
        title: `TRANSFER CONFIRMED: ${playerName} Signs for ${buyer.Name}!`,
        subtitle: `${isFreeAgent ? 'Signed as Free Agent' : `Transferred from ${seller?.Name ?? fromOrigin}`} • Fee: ${formattedFee}`,
        summary: `${buyer.Name} have officially secured the signature of ${player.Position || 'player'} ${playerName} (Age ${player.Age}) ${seller ? `from ${fromOrigin}` : 'on a free transfer'}. Full terms and medical completed.`,
        bulletPoints: [
          `📋 Transferred From: ${fromOrigin}`,
          `🎯 Destination: ${toDestination}`,
          `💶 Agreed Fee: ${formattedFee} (Valuation: €${(player.Value || fee).toLocaleString()})`,
          `⭐ Player Profile: ${player.Position || 'ATH'} | Age ${player.Age} | Overall Rating: ${rating}`,
        ],
        transferDetails: {
          playerId: player.id,
          playerName,
          position: player.Position ?? 'Player',
          age: player.Age ?? 25,
          rating,
          fee,
          wage: player.Wage ?? 0,
          value: player.Value ?? fee,
          buyerClubId: buyer.id,
          buyerClubName: buyer.Name,
          buyerClubCode: buyer.ClubCode,
          sellerClubId: seller?.id,
          sellerClubName: seller?.Name,
          sellerClubCode: seller?.ClubCode,
          fromOrigin,
          toDestination,
          dealType,
          date: formattedDate,
          managerQuote: `We are absolutely delighted to finalize terms with ${player.FirstName}. Their technical maturity and competitive drive make them an ideal addition to our squad structure.`,
          scoutingVerdict: `A versatile ${player.Position} capable of excelling under pressure. Brings immediate tactical balance and depth to ${buyer.Name}.`,
        },
        fullStory: `In a landmark piece of transfer business finalized today, ${buyer.Name} have officially confirmed the acquisition of ${playerName}.\n\nThe ${player.Age}-year-old ${player.Position} arrives ${seller ? `from ${fromOrigin} in a deal structured at ${formattedFee}` : 'following contract agreements via free agency'}.\n\nClub sporting directors praised the smooth conclusion of negotiations, noting that ${playerName} passed medical examinations without incident and will immediately join training ahead of upcoming fixtures.`,
        quote: {
          author: `${buyer.Name} Sporting Director`,
          role: 'Official Club Transfer Statement',
          text: `Signing a player of ${player.FirstName}'s calibre reinforces our commitment to competing at the highest level. We look forward to seeing their impact on the pitch.`,
        },
        hero: {
          format: 'transfer_wire',
          homeCode: seller?.ClubCode || 'FA',
          awayCode: buyer.ClubCode,
          homeName: fromOrigin,
          awayName: buyer.Name,
          bannerTheme: 'classic_gold',
        },
        actions: [
          {
            label: 'View Deal Details',
            action: 'open_story',
            icon: 'mdi-file-document-outline',
            color: 'teal-accent-4',
          },
          {
            label: 'Transfer Market',
            action: 'view_transfers',
            to: '/transfers',
            icon: 'mdi-swap-horizontal',
            color: 'primary',
          },
        ],
        timestamp: formattedDate,
        hypeScore: fee > 10000000 ? 5 : 4,
      });
    }

    return items;
  }

  /**
   * Generates Overseas / International dispatch feed featuring foreign fictional leagues
   * and international transfer scouting.
   */
  private static generateOverseasFeed(
    formattedDate: string,
    currentDay: number
  ): MediaItem[] {
    return [
      {
        id: `overseas-scouting-${currentDay}`,
        type: 'news',
        category: 'transfer',
        badge: '🌍 OVERSEAS SCOUTING WIRE',
        badgeColor: 'teal-accent-4',
        title: 'Global Scouting Wire: Standouts Emerging from Overseas Leagues',
        subtitle: `Trans-Oceanic Football Observatory • Matchday ${currentDay}`,
        summary:
          'Scouting networks across Europe have intensified monitoring of standout free agents and emerging talents competing in the Nordkapp Eliteserie, Valencian Liga Mayor, and Oceanic Super League.',
        bulletPoints: [
          'Continental Influx: Foreign free agents across all positions entering the transfer market.',
          'Market Opportunity: International unattached players available on immediate free transfers.',
          'Scouting Profile: High physical resilience and rapid transition play catching managers’ attention.',
        ],
        transferDetails: {
          playerName: 'Valentin Rosales',
          position: 'MID',
          age: 22,
          rating: 77,
          fee: 0,
          wage: 82000,
          value: 4100000,
          buyerClubName: 'European Scouting Target Pool',
          buyerClubCode: 'POOL',
          fromOrigin: 'Valencian Liga Mayor (Overseas)',
          toDestination: 'Domestic League Transfer Market',
          dealType: 'International Free Agent Influx',
          date: formattedDate,
          managerQuote:
            'Overseas scouting reports indicate extraordinary technical flair and spatial vision from these international arrivals.',
          scoutingVerdict:
            'Exceptional passing range and dribbling composure. High return-on-investment potential for domestic clubs seeking quality depth.',
        },
        fullStory: `European scouts have descended upon several prominent overseas territories as clubs prepare their recruitment strategies for the transfer window.\n\n Standouts from the Nordkapp Eliteserie, Valencian Liga Mayor, and Trans-Oceanic Super League are gaining widespread attention due to their athletic conditioning, tactical flexibility, and availability without exorbitant transfer fees.\n\nManagers across Bellean and Kev leagues have been urged to review international profiles and move decisively before rival clubs secure their commitments.`,
        quote: {
          author: 'Head of International Scouting',
          role: 'Continental Talent Scout',
          text: 'The quality of overseas unattached talent currently on the market is unprecedented. Clubs willing to do their homework can land starting-caliber players on incredible value.',
        },
        hero: {
          format: 'poster',
          bannerTheme: 'stadium_blue',
          caption: 'International Scouting Network Briefing',
        },
        actions: [
          {
            label: 'View Scouting Dossier',
            action: 'open_story',
            icon: 'mdi-file-document-outline',
            color: 'teal-accent-4',
          },
          {
            label: 'Explore Transfers',
            action: 'view_transfers',
            to: '/transfers',
            icon: 'mdi-account-search',
            color: 'primary',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 4,
      },
      {
        id: `overseas-match-${currentDay}`,
        type: 'promo',
        category: 'general',
        badge: '🏆 TRANS-OCEANIC SUPER LEAGUE',
        badgeColor: 'amber-accent-4',
        title: 'Trans-Oceanic Super Cup: Dramatic 4-3 Thriller Electrifies Fans',
        subtitle: 'World Football Headline • Continental Climax',
        summary:
          'A breathless 7-goal spectacle highlighted by a 94th-minute volley from outside the box proved once again the growing spectacle of the overseas tournament circuit.',
        bulletPoints: [
          'Late Drama: Three goals scored in the final 10 minutes of regulation.',
          'Global Broadcast: Reaching millions of viewers across system nations.',
        ],
        fullStory: `Fans in attendance at the Oceanic Colosseum were treated to an unforgettable match of football as seven goals lit up the Trans-Oceanic Super Cup final.\n\nWith the match tied at 3-3 going into stoppage time, a stunning 25-yard dipping volley sealed victory in the 94th minute, triggering delirious celebrations on the pitch.`,
        hero: {
          format: 'poster',
          bannerTheme: 'classic_gold',
          caption: 'Trans-Oceanic Super Cup Final',
        },
        actions: [
          {
            label: 'Read Match Story',
            action: 'open_story',
            icon: 'mdi-newspaper-variant-outline',
            color: 'amber-accent-4',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 5,
      },
      {
        id: `overseas-video-${currentDay}`,
        type: 'video',
        category: 'general',
        badge: '🎬 GLOBAL SKILL REEL',
        badgeColor: 'red-accent-3',
        title: 'Overseas Vault: Top 10 International Volleys & Saves',
        subtitle: 'Global Broadcast Stream • 1080p Stream',
        summary:
          'Watch the most breathtaking strikes, acrobatic bicycle kicks, and fingertip stops from leagues across the globe.',
        hero: {
          format: 'video_player',
          videoDuration: '2:50',
          bannerTheme: 'derby_fire',
        },
        actions: [
          {
            label: 'Watch Reel',
            action: 'play_video',
            icon: 'mdi-play-circle',
            color: 'red-accent-3',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 4,
      },
      {
        id: `overseas-photo-${currentDay}`,
        type: 'picture',
        category: 'matchday',
        badge: '📸 WORLD STADIUMS',
        badgeColor: 'cyan-accent-3',
        title: 'The Grand Oceanic Colosseum Under Lights',
        subtitle: 'Iconic Arenas of the World',
        summary:
          'With an 85,000 capacity under illuminated arches, the Colosseum stands as a testament to the global passion for the game.',
        hero: {
          format: 'stadium',
          stadiumName: 'The Grand Oceanic Colosseum',
          bannerTheme: 'stadium_blue',
          caption: 'Aerial panorama of the 85,000-seater arena',
        },
        actions: [
          {
            label: 'View Photo Dossier',
            action: 'open_story',
            icon: 'mdi-image-outline',
            color: 'cyan-accent-3',
          },
        ],
        timestamp: formattedDate,
        hypeScore: 3,
      },
    ];
  }
}
