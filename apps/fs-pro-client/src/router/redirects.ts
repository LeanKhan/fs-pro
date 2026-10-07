/** Where managers land: their campus is home (docs/CORE-LOOP.md, "One shell"). */

/** Old dashboard tab index -> the campus Manager hub action (club-game.vue onAct). */
const HUB_FOR_TAB = ['matchday', 'tactics', 'squad', 'club', 'club', 'transfers', 'analysis', 'matchday'];

/** The old club dashboard, for managers: the same screens in the campus hub. */
export function clubDashboardRedirect(to: { params: Record<string, unknown>; query: Record<string, unknown> }) {
  try {
    const u = JSON.parse(window.localStorage.getItem('fspro-user') || 'null');
    if (!u || u.isAdmin) return true;
  } catch {
    return true;
  }
  const open = HUB_FOR_TAB[Number(to.query.tab ?? 0)] ?? 'matchday';
  return { path: `/game/${to.params.id}`, query: { open } };
}

export function myGround(): string | null {
  try {
    const u = JSON.parse(window.localStorage.getItem('fspro-user') || 'null');
    if (!u || u.isAdmin) return null;
    const firstClub = u.clubs?.[0];
    const clubId = typeof firstClub === 'string' ? firstClub : firstClub?._id;
    return clubId ? `/game/${clubId}` : null;
  } catch {
    return null;
  }
}
