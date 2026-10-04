import { crestUrl } from '@/helpers/crest';

/** Kit colours for a club, read from its crest: a founded club's crest says
 * them outright (data-kit), a hand-drawn one gives its two most-used fills. */
const cache = new Map<string, Promise<[string, string]>>();
const FALLBACK: [string, string] = ['#3a6fd8', '#f5f1e6'];

export function clubColors(code: string | null | undefined): Promise<[string, string]> {
  if (!code) return Promise.resolve(FALLBACK);
  if (!cache.has(code)) {
    cache.set(
      code,
      fetch(crestUrl(code))
        .then((r) => (r.ok ? r.text() : ''))
        .then((svg) => {
          const kit = svg.match(/data-kit="(#[0-9a-f]{6}),(#[0-9a-f]{6})"/i);
          if (kit) return [kit[1].toLowerCase(), kit[2].toLowerCase()] as [string, string];
          const counts = new Map<string, number>();
          for (const m of svg.matchAll(/fill(?:="|:)\s*(#[0-9a-f]{6})/gi)) {
            const c = m[1].toLowerCase();
            counts.set(c, (counts.get(c) ?? 0) + 1);
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
          return [top[0] ?? FALLBACK[0], top[1] ?? FALLBACK[1]] as [string, string];
        })
        .catch(() => FALLBACK),
    );
  }
  return cache.get(code)!;
}

/** <img @error>: swap a missing crest for a plain shield with the club's initial. */
export function crestFallback(e: Event, name: string) {
  const img = e.target as HTMLImageElement;
  const letter = (name.trim()[0] ?? '?').toUpperCase().replace(/[<&]/g, '');
  img.onerror = null;
  img.src = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44"><path d="M20 2l16 5v13c0 11-7 18-16 22C11 38 4 31 4 20V7z" fill="${FALLBACK[0]}" stroke="#3b2a1a" stroke-width="2.4"/><text x="20" y="28" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="17" fill="#fff">${letter}</text></svg>`
  )}`;
}
