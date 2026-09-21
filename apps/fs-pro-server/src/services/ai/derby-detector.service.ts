export interface DerbyContext {
  isSpecialEvent: boolean;
  eventType: 'local_derby' | 'title_decider' | 'relegation_six_pointer' | 'standard';
  eventName: string;
  eventTag: string;
  city?: string;
  narrativeAngle: 'bragging_rights' | 'title_race' | 'survival' | 'routine';
  hypeScore: number; // 1 to 5
  description: string;
}

export interface ClubInfo {
  id?: string;
  Name?: string;
  ClubCode?: string;
  Address?: {
    City?: string;
    Section?: string;
    Country?: string;
    [key: string]: unknown;
  } | null;
  Rating?: number;
  [key: string]: unknown;
}

export class DerbyDetectorService {
  // Known curated rivalries in the game world
  private static readonly CURATED_DERBIES: Record<string, string> = {
    'AP:RP': 'The Philamentia Derby',
    'RP:AP': 'The Philamentia Derby',
    'CHI:CTR': 'The Ceviva Derby',
    'CTR:CHI': 'The Ceviva Derby',
    'FUN:TRI': 'The Feedhein Clashing Tridents',
    'TRI:FUN': 'The Feedhein Clashing Tridents',
    'BPG:FZP': 'The Pregge Town Showdown',
    'FZP:BPG': 'The Pregge Town Showdown',
    'PGS:BFZ': 'The Portgregge Coastal Derby',
    'BFZ:PGS': 'The Portgregge Coastal Derby',
  };

  /**
   * Analyzes home and away clubs to detect local derbies, regional rivalries,
   * or high-stakes positional clashes.
   */
  public static detect(home: ClubInfo, away: ClubInfo, standingsContext?: {
    homePos?: number;
    awayPos?: number;
    totalTeams?: number;
  }): DerbyContext {
    const homeCode = home.ClubCode ?? '';
    const awayCode = away.ClubCode ?? '';
    const pairKey = `${homeCode}:${awayCode}`;

    // 1. Curated Rivalry Registry check
    if (this.CURATED_DERBIES[pairKey]) {
      const derbyName = this.CURATED_DERBIES[pairKey];
      return {
        isSpecialEvent: true,
        eventType: 'local_derby',
        eventName: derbyName,
        eventTag: `⚔️ ${derbyName}`,
        city: home.Address?.City ?? 'Local',
        narrativeAngle: 'bragging_rights',
        hypeScore: 5,
        description: `Bitter crosstown rivals ${home.Name || homeCode} and ${away.Name || awayCode} collide for undisputed city supremacy.`,
      };
    }

    // 2. Shared City / Geographic Proximity check
    const homeCity = (home.Address?.City || '').trim().toLowerCase();
    const awayCity = (away.Address?.City || '').trim().toLowerCase();
    const homeSection = (home.Address?.Section || '').trim().toLowerCase();
    const awaySection = (away.Address?.Section || '').trim().toLowerCase();

    if (homeCity && awayCity && homeCity === awayCity) {
      const cityName = home.Address?.City || 'City';
      const derbyName = `The ${cityName} Derby`;
      return {
        isSpecialEvent: true,
        eventType: 'local_derby',
        eventName: derbyName,
        eventTag: `⚔️ ${derbyName}`,
        city: cityName,
        narrativeAngle: 'bragging_rights',
        hypeScore: 5,
        description: `Local rivalry ignites as both ${cityName} clubs battle for neighborhood dominance.`,
      };
    }

    // 3. Shared Name Root / Token Matching (e.g. "Philamentia")
    const homeTokens = (home.Name || '').toLowerCase().split(/[\s.-]+/);
    const awayTokens = (away.Name || '').toLowerCase().split(/[\s.-]+/);
    const commonSignificantTokens = homeTokens.filter(
      (t) => t.length > 4 && awayTokens.includes(t) && !['united', 'city', 'town', 'athletic', 'rovers', 'sports', 'football'].includes(t)
    );

    if (commonSignificantTokens.length > 0) {
      const tokenCap = commonSignificantTokens[0].charAt(0).toUpperCase() + commonSignificantTokens[0].slice(1);
      const derbyName = `The ${tokenCap} Derby`;
      return {
        isSpecialEvent: true,
        eventType: 'local_derby',
        eventName: derbyName,
        eventTag: `⚔️ ${derbyName}`,
        city: tokenCap,
        narrativeAngle: 'bragging_rights',
        hypeScore: 4,
        description: `A clash of shared heritage as ${home.Name} meets ${away.Name}.`,
      };
    }

    // 4. Standings-based high stakes (Title Decider or Relegation 6-Pointer)
    if (standingsContext?.homePos && standingsContext?.awayPos) {
      const { homePos, awayPos, totalTeams = 10 } = standingsContext;
      // Top 2 clash
      if (homePos <= 2 && awayPos <= 2) {
        return {
          isSpecialEvent: true,
          eventType: 'title_decider',
          eventName: 'Title Decider Clash',
          eventTag: '🏆 Title Decider',
          narrativeAngle: 'title_race',
          hypeScore: 5,
          description: `First against second in a monumental six-pointer that could define the title race.`,
        };
      }

      // Relegation scrap (both in bottom 2)
      if (homePos >= totalTeams - 1 && awayPos >= totalTeams - 1) {
        return {
          isSpecialEvent: true,
          eventType: 'relegation_six_pointer',
          eventName: 'Relegation Six-Pointer',
          eventTag: '⚠️ Survival Battle',
          narrativeAngle: 'survival',
          hypeScore: 4,
          description: `Crucial survival encounter at the foot of the table where neither side can afford defeat.`,
        };
      }
    }

    // Standard Fixture
    return {
      isSpecialEvent: false,
      eventType: 'standard',
      eventName: 'League Matchday',
      eventTag: '⚽ Matchday Focus',
      narrativeAngle: 'routine',
      hypeScore: 2,
      description: `${home.Name || homeCode} host ${away.Name || awayCode} in competitive league action.`,
    };
  }
}
