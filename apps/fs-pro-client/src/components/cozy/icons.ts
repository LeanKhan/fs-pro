// Hand-drawn inline SVG icons, so the game ships with no image assets.
const svg = (body: string, vb = '0 0 32 32') => `<svg viewBox="${vb}" class="ic" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  coins: svg('<circle cx="16" cy="16" r="13" fill="#f5b82e" stroke="#c98a12" stroke-width="2.5"/><circle cx="16" cy="16" r="8.5" fill="#ffd45c"/><path d="M16 10.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" fill="#e39a12"/>'),
  hammer: svg('<path d="M7 25l11-11" stroke="#8a5a3b" stroke-width="4" stroke-linecap="round"/><path d="M14 7l6-3 8 8-3 6-4-4-3 1-3-3 1-3z" fill="#8f97a6" stroke="#535b69" stroke-width="2" stroke-linejoin="round"/>'),
  people: svg('<circle cx="16" cy="10" r="5.5" fill="#f2c79b" stroke="#8a5a3b" stroke-width="1.8"/><path d="M10.4 9c.5-4 4-5.5 6.5-5 2.5.3 4.6 2.6 4.6 5-3 .2-7-.6-11.1 0z" fill="#6b3f22"/><path d="M6 28c0-6 4.5-10 10-10s10 4 10 10z" fill="#3a6fd8" stroke="#23458f" stroke-width="1.8"/>'),
  bag: svg('<path d="M7 12h18l-2 15H9z" fill="#c4874a" stroke="#7a4b22" stroke-width="2" stroke-linejoin="round"/><path d="M11 12V9a5 5 0 0110 0v3" stroke="#7a4b22" stroke-width="2.4" fill="none"/><rect x="13" y="16" width="6" height="4" rx="1" fill="#f2b632"/>'),
  map: svg('<path d="M4 8l7-3 10 3 7-3v19l-7 3-10-3-7 3z" fill="#7fcf6b" stroke="#2f7d43" stroke-width="2" stroke-linejoin="round"/><path d="M11 5v19M21 8v19" stroke="#2f7d43" stroke-width="1.6"/><path d="M16 9c-2.8 0-4.5 2-4.5 4.4 0 3.3 4.5 7.6 4.5 7.6s4.5-4.3 4.5-7.6C20.5 11 18.8 9 16 9z" fill="#e5402f" stroke="#9a2216" stroke-width="1.6"/><circle cx="16" cy="13.4" r="1.6" fill="#fff"/>'),
  mail: svg('<rect x="4" y="8" width="24" height="17" rx="3" fill="#fff6e8" stroke="#b5402f" stroke-width="2"/><path d="M5 10l11 8 11-8" stroke="#e5402f" stroke-width="2.4" fill="none" stroke-linejoin="round"/>'),
  trophy: svg('<path d="M10 5h12v6a6 6 0 01-12 0z" fill="#f5b82e" stroke="#b97f0f" stroke-width="2"/><path d="M10 7H6c0 4 2 6 4.5 6M22 7h4c0 4-2 6-4.5 6" stroke="#b97f0f" stroke-width="2" fill="none"/><path d="M14 17h4v4h-4z" fill="#e39a12"/><rect x="10" y="21" width="12" height="5" rx="1.5" fill="#8a5a3b"/>'),
  gear: svg('<path d="M16 4l2.2 3.2 3.8-.9.7 3.8 3.4 1.8-1.6 3.6 1.6 3.6-3.4 1.8-.7 3.8-3.8-.9L16 28l-2.2-3.2-3.8.9-.7-3.8-3.4-1.8 1.6-3.6-1.6-3.6 3.4-1.8.7-3.8 3.8.9z" fill="#9aa3b5" stroke="#5a6273" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="4.2" fill="#eef1f7" stroke="#5a6273" stroke-width="2"/>'),
  star: svg('<path d="M16 3.5l3.8 7.7 8.5 1.2-6.2 6 1.5 8.4L16 22.8l-7.6 4 1.5-8.4-6.2-6 8.5-1.2z" fill="#f5b82e" stroke="#b97f0f" stroke-width="2" stroke-linejoin="round"/>'),
  ball: svg('<circle cx="16" cy="16" r="12.5" fill="#fff" stroke="#2b2b3a" stroke-width="2"/><path d="M16 10.5l4.8 3.5-1.8 5.6h-6l-1.8-5.6z" fill="#2b2b3a"/><path d="M16 10.5V4M20.8 14l6-2M19 19.6l3.6 5.4M13 19.6l-3.6 5.4M11.2 14l-6-2" stroke="#2b2b3a" stroke-width="1.8"/>'),
  clock: svg('<circle cx="16" cy="16" r="12" fill="#fff" stroke="#8a5a3b" stroke-width="2.4"/><path d="M16 9v7l5 3" stroke="#8a5a3b" stroke-width="2.4" stroke-linecap="round" fill="none"/>'),
  check: svg('<path d="M7 17l6 6 12-13" stroke="#4fae2e" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: svg('<path d="M9 9l14 14M23 9L9 23" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>'),
  rotate: svg('<path d="M24 12a9 9 0 10.5 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M25 5v7h-7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  move: svg('<path d="M16 4v24M4 16h24M16 4l-4 4M16 4l4 4M16 28l-4-4M16 28l4-4M4 16l4-4M4 16l4 4M28 16l-4-4M28 16l-4 4" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/>'),
  up: svg('<path d="M16 5l9 10h-5v11h-8V15H7z" fill="#5cc23a" stroke="#2f8a1c" stroke-width="2" stroke-linejoin="round"/>'),
  alert: svg('<circle cx="16" cy="16" r="13" fill="#e5402f" stroke="#9a2216" stroke-width="2"/><path d="M16 8v10" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="23.5" r="2.3" fill="#fff"/>'),
  cross: svg('<rect x="4" y="4" width="24" height="24" rx="6" fill="#fff" stroke="#e5402f" stroke-width="2.5"/><path d="M16 9v14M9 16h14" stroke="#e5402f" stroke-width="5" stroke-linecap="round"/>'),
  news: svg('<rect x="4" y="6" width="22" height="20" rx="2" fill="#fffaf0" stroke="#5d6470" stroke-width="2"/><path d="M26 11h2v13a2 2 0 01-4 0" fill="none" stroke="#5d6470" stroke-width="2"/><rect x="8" y="10" width="7" height="6" fill="#3a8ee0"/><path d="M18 11h5M18 15h5M8 20h15M8 23h11" stroke="#5d6470" stroke-width="1.8" stroke-linecap="round"/>'),
  bolt: svg('<path d="M18 3L7 18h8l-2 11 12-16h-8z" fill="#f6d02f" stroke="#b98d0f" stroke-width="2" stroke-linejoin="round"/>'),
};

export const icon = (name: string) => ICONS[name] ?? '';
