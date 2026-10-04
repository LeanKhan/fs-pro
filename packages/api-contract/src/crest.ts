// packages/api-contract/src/crest.ts
//
// Crests for clubs founded in the game. The 44 original clubs keep their
// hand-drawn SVGs (client public/club-icons); every founded club stores a
// CrestDesign in Clubs.Crest and is drawn by renderCrestSvg, on the client
// for the live preview and on the server for GET /api/crests/:code.svg.

export const CREST_SHAPES = ['shield', 'heater', 'round', 'badge', 'pennant'] as const;
export const CREST_PATTERNS = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron', 'quarters', 'cross'] as const;
export const CREST_EMBLEMS = ['ball', 'star', 'crown', 'bolt', 'wave', 'tree', 'tower', 'anchor', 'none'] as const;

export type CrestShape = (typeof CREST_SHAPES)[number];
export type CrestPattern = (typeof CREST_PATTERNS)[number];
export type CrestEmblem = (typeof CREST_EMBLEMS)[number];

export interface CrestDesign {
  shape: CrestShape;
  pattern: CrestPattern;
  emblem: CrestEmblem;
  /** Main kit colour. */
  primary: string;
  /** Second kit colour. */
  secondary: string;
  /** Emblem and ribbon colour. */
  trim: string;
  /** Up to 4 letters on the ribbon (usually the club code). */
  initials: string;
}

/** Colours offered by the crest designer (any #rrggbb is accepted). */
export const CREST_PALETTE = [
  '#d8342c', '#8e1b2b', '#f08a1c', '#f5b82e', '#2f8a1c', '#5cc23a', '#13795b', '#2fb3a6',
  '#3a8ee0', '#1f4fa3', '#14204a', '#6a3fb5', '#c2389b', '#f2f2ee', '#2b2b30', '#8a5a3b',
] as const;

const HEX = /^#[0-9a-f]{6}$/i;
const OUTLINE = '#3b2a1a';

export function isCrestDesign(v: unknown): v is CrestDesign {
  const d = v as CrestDesign;
  return (
    !!d &&
    typeof d === 'object' &&
    (CREST_SHAPES as readonly string[]).includes(d.shape) &&
    (CREST_PATTERNS as readonly string[]).includes(d.pattern) &&
    (CREST_EMBLEMS as readonly string[]).includes(d.emblem) &&
    HEX.test(d.primary) &&
    HEX.test(d.secondary) &&
    HEX.test(d.trim) &&
    typeof d.initials === 'string' &&
    /^[A-Z0-9]{0,4}$/.test(d.initials)
  );
}

/** A stable random-looking crest for `seed` (AI clubs, first suggestion). */
export function randomCrest(seed: string, initials = ''): CrestDesign {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  };
  const pick = <T>(list: readonly T[], salt: number) => list[hash(`${salt}:${seed}`) % list.length]!;
  const strong = CREST_PALETTE.filter((c) => c !== '#f2f2ee');
  const primary = pick(strong, 0);
  let secondary = pick(CREST_PALETTE, 5);
  if (secondary === primary) secondary = '#f2f2ee';
  return {
    shape: pick(CREST_SHAPES, 3),
    pattern: pick(CREST_PATTERNS, 9),
    emblem: pick(CREST_EMBLEMS.slice(0, -1), 13),
    primary,
    secondary,
    trim: luminance(primary) > 0.6 ? '#2b2b30' : '#fffaf0',
    initials: initials.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4),
  };
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

// Everything is drawn in a 100 x 112 box.
const SHAPES: Record<CrestShape, string> = {
  shield: 'M50 4 L92 15 V50 C92 80 74 98 50 108 C26 98 8 80 8 50 V15 Z',
  heater: 'M8 6 H92 V46 C92 77 73 97 50 108 C27 97 8 77 8 46 Z',
  round: 'M50 8 A48 48 0 1 1 49.9 8 Z',
  badge: 'M30 5 H70 L94 29 V77 L70 107 H30 L6 77 V29 Z',
  pennant: 'M8 6 H92 V80 L50 108 L8 80 Z',
};

function patternSvg(p: CrestPattern, a: string, b: string) {
  const base = `<rect width="100" height="112" fill="${a}"/>`;
  switch (p) {
    case 'stripes':
      return base + [14, 43, 72].map((x) => `<rect x="${x}" width="14" height="112" fill="${b}"/>`).join('');
    case 'hoops':
      return base + [18, 46, 74].map((y) => `<rect y="${y}" width="100" height="14" fill="${b}"/>`).join('');
    case 'halves':
      return base + `<rect x="50" width="50" height="112" fill="${b}"/>`;
    case 'sash':
      return base + `<path d="M-10 18 L22 -8 L112 92 L80 118 Z" fill="${b}"/>`;
    case 'chevron':
      return base + `<path d="M0 34 L50 66 L100 34 V58 L50 90 L0 58 Z" fill="${b}"/>`;
    case 'quarters':
      return base + `<rect x="50" width="50" height="56" fill="${b}"/><rect y="56" width="50" height="56" fill="${b}"/>`;
    case 'cross':
      return base + `<rect x="41" width="18" height="112" fill="${b}"/><rect y="44" width="100" height="18" fill="${b}"/>`;
    default:
      return base;
  }
}

// Emblems are drawn around (0,0) at roughly 40 units across.
const EMBLEMS: Record<Exclude<CrestEmblem, 'none'>, (t: string) => string> = {
  ball: (t) =>
    `<circle r="17" fill="${t}" stroke="${OUTLINE}" stroke-width="3"/><path d="M0 -7 L7 -2 L4.5 6.5 H-4.5 L-7 -2 Z" fill="${OUTLINE}"/><path d="M0 -7 V-17 M7 -2 L16 -6 M4.5 6.5 L10 14 M-4.5 6.5 L-10 14 M-7 -2 L-16 -6" stroke="${OUTLINE}" stroke-width="2.4"/>`,
  star: (t) =>
    `<path d="M0 -20 L5.9 -8.1 L19 -6.2 L9.5 3.1 L11.8 16.2 L0 10 L-11.8 16.2 L-9.5 3.1 L-19 -6.2 L-5.9 -8.1 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
  crown: (t) =>
    `<path d="M-19 12 L-21 -10 L-9 0 L0 -16 L9 0 L21 -10 L19 12 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/><rect x="-19" y="12" width="38" height="7" rx="2" fill="${t}" stroke="${OUTLINE}" stroke-width="3"/>`,
  bolt: (t) =>
    `<path d="M4 -21 L-13 3 H-1 L-5 21 L13 -4 H1 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
  wave: (t) =>
    `<path d="M-21 2 C-14 -12 -4 -12 1 -2 C5 6 13 5 19 -4 V14 H-21 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/><path d="M-21 -8 C-14 -20 -4 -20 1 -10" stroke="${t}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  tree: (t) =>
    `<path d="M0 -21 L15 2 H7 L17 13 H-17 L-7 2 H-15 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/><rect x="-3.5" y="13" width="7" height="8" fill="${OUTLINE}"/>`,
  tower: (t) =>
    `<path d="M-15 20 V-6 H-15 V-16 H-8 V-10 H-3 V-16 H3 V-10 H8 V-16 H15 V20 Z" fill="${t}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/><path d="M-5 20 V8 A5 5 0 0 1 5 8 V20" fill="${OUTLINE}"/>`,
  anchor: (t) =>
    `<g fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"><circle cy="-14" r="5"/><path d="M0 -9 V19 M-10 -2 H10 M-17 6 C-15 16 -7 20 0 19 C7 20 15 16 17 6"/></g><g fill="none" stroke="${t}" stroke-width="3.4" stroke-linecap="round"><circle cy="-14" r="5"/><path d="M0 -9 V19 M-10 -2 H10 M-17 6 C-15 16 -7 20 0 19 C7 20 15 16 17 6"/></g>`,
};

/**
 * The crest as a standalone SVG string. The root element carries
 * `data-kit="primary,secondary"` so kit colours never have to be guessed
 * from fills (see the client's club-colors.ts).
 */
export function renderCrestSvg(design: CrestDesign, opts: { id?: string } = {}): string {
  const d = isCrestDesign(design) ? design : randomCrest('fallback');
  const id = (opts.id ?? 'c').replace(/[^a-z0-9_-]/gi, '');
  const clip = `crest-${id}`;
  const shape = SHAPES[d.shape];
  const initials = d.initials;
  const hasEmblem = d.emblem !== 'none';
  const ribbonY = d.shape === 'round' ? 72 : 74;

  const emblem = hasEmblem
    ? `<g transform="translate(50 ${initials ? 46 : 54}) scale(${initials ? 1 : 1.25})">${EMBLEMS[d.emblem as Exclude<CrestEmblem, 'none'>](d.trim)}</g>`
    : '';
  const letters = initials
    ? hasEmblem
      ? `<path d="M14 ${ribbonY} H86 L80 ${ribbonY + 10} L86 ${ribbonY + 20} H14 L20 ${ribbonY + 10} Z" fill="${d.trim}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>` +
        `<text x="50" y="${ribbonY + 15}" text-anchor="middle" font-family="Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif" font-weight="700" font-size="${initials.length > 3 ? 13 : 15}" letter-spacing="1" fill="${OUTLINE}">${initials}</text>`
      : `<text x="50" y="${initials.length > 2 ? 66 : 70}" text-anchor="middle" font-family="Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif" font-weight="700" font-size="${initials.length > 2 ? 28 : 38}" fill="${d.trim}" stroke="${OUTLINE}" stroke-width="3" paint-order="stroke">${initials}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" data-kit="${d.primary},${d.secondary}">` +
    `<defs><clipPath id="${clip}"><path d="${shape}"/></clipPath></defs>` +
    `<g clip-path="url(#${clip})">${patternSvg(d.pattern, d.primary, d.secondary)}` +
    `<path d="M0 0 H100 V40 C70 30 30 30 0 40 Z" fill="#fff" opacity=".14"/></g>` +
    `<path d="${shape}" fill="none" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="${shape}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" transform="translate(50 56) scale(.9) translate(-50 -56)"/>` +
    emblem +
    letters +
    `</svg>`
  );
}

/** The crest as a data: URL, for <img src> previews. */
export const crestDataUrl = (design: CrestDesign, id?: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderCrestSvg(design, { id }))}`;

// --- Kits ---------------------------------------------------------------------

const SHIRT = 'M30 8 L42 4 C45 10 55 10 58 4 L70 8 L92 22 L84 40 L74 35 V96 H26 V35 L16 40 L8 22 Z';

/** A home shirt in the crest's colours and pattern, for kit thumbnails. */
export function renderKitSvg(design: CrestDesign, opts: { id?: string } = {}): string {
  const d = isCrestDesign(design) ? design : randomCrest('fallback');
  const clip = `kit-${(opts.id ?? 'k').replace(/[^a-z0-9_-]/gi, '')}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-kit="${d.primary},${d.secondary}">` +
    `<defs><clipPath id="${clip}"><path d="${SHIRT}"/></clipPath></defs>` +
    `<g clip-path="url(#${clip})"><g transform="translate(0 -6)">${patternSvg(d.pattern, d.primary, d.secondary)}</g>` +
    `<path d="M8 22 L30 8 L26 35 L16 40 Z M92 22 L70 8 L74 35 L84 40 Z" fill="${d.secondary}" opacity=".9"/></g>` +
    `<path d="${SHIRT}" fill="none" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="M42 4 C45 13 55 13 58 4" fill="none" stroke="${d.trim}" stroke-width="4"/>` +
    `</svg>`
  );
}
