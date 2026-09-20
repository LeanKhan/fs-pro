export type CompetitionKind = 'league' | 'cup' | 'continental';

export interface CompetitionStyle {
  kind: CompetitionKind;
  /** Short code shown in tight spaces, e.g. "KLV", "FAC-KEV", "CCL". */
  code: string;
  /** Readable name, e.g. "Domestic Cup (KEV)". */
  label: string;
  /** Vuetify colour name for chips. */
  color: string;
  /** Hex for borders / accents in custom CSS. */
  hex: string;
  icon: string;
}

interface FixtureLike {
  LeagueCode?: string | null;
  Type?: string | null;
  Stage?: string | null;
  Week?: number | null;
}

/** Colour and icon per competition kind - gold cups, cyan continental,
 * indigo leagues. */
const KIND_STYLE: Record<CompetitionKind, Pick<CompetitionStyle, 'color' | 'hex' | 'icon'>> = {
  cup: { color: 'amber-darken-2', hex: '#f59e0b', icon: 'mdi-trophy-award' },
  continental: { color: 'cyan', hex: '#22d3ee', icon: 'mdi-star-shooting' },
  league: { color: 'indigo-lighten-2', hex: '#818cf8', icon: 'mdi-soccer' },
};

/** Works out which competition a fixture belongs to from its `LeagueCode`
 * (the competition code) - `FAC-<country>` domestic cups, `CCL` the
 * continental competition, anything else a league. */
export function competitionStyle(fixture: FixtureLike): CompetitionStyle {
  const code = (fixture.LeagueCode ?? '').toUpperCase();
  const type = (fixture.Type ?? '').toLowerCase();

  let kind: CompetitionKind = 'league';
  let label = code || 'League';

  if (code.startsWith('FAC') || type === 'cup') {
    kind = 'cup';
    const country = code.split('-')[1];
    label = country ? `Domestic Cup (${country})` : 'Association Cup';
  } else if (code === 'CCL' || type === 'tournament') {
    kind = 'continental';
    label = 'Continental Champions League';
  }

  return { kind, code: code || '—', label, ...KIND_STYLE[kind] };
}

/** Round / group for knockout and group fixtures, matchweek for leagues. */
export function fixtureRound(fixture: FixtureLike): string {
  const style = competitionStyle(fixture);
  if (style.kind !== 'league' && fixture.Stage) return fixture.Stage;
  return fixture.Week != null ? `Week ${fixture.Week}` : '';
}
