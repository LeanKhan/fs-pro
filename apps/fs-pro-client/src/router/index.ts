import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

/** ADMIN ROUTES */
import clubs from './clubs';
import players from './players';
import managers from './managers';
import competitions from './competitions';
// import Calendar from '@/views/admin/calendar/calendar.vue';
/** ADMIN ROUTES */

/** USER ROUTES */
import userClubRoutes from './user/club';
import { myGround } from './redirects';
// import AllFixtures from '@/views/user/seasons/fixtures.vue';
/** USER ROUTES */

// import AdminHome from '@/views/admin/dashboard.vue';
import AppView from '@/views/app-view.vue';
// import UserDashboard from '@/views/user/dashboard.vue';
// import Auth from '@/views/auth/auth.vue';
// import Login from '@/views/auth/login.vue';
// import Register from '@/views/auth/register.vue';
import Credits from '@/views/credits.vue';

export function replaceParams(
  path: string,
  replacements: { search: string; replace: string }[]
): string {
  replacements.forEach((r) => {
    path = path.replace(r.search, r.replace);
  });

  return path;
}

/** The signed-in manager's own ground, or null (admin, no club, signed out). */
const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: () =>
      import(/* webpackChunkName: "auth_home" */ '../views/auth/auth.vue'),
    name: 'Auth',
    redirect: 'auth/login',
    children: [
      {
        // Where Imagination login lands: picks up the session the server just
        // created and signs this app in.
        path: 'complete',
        component: () =>
          import(/* webpackChunkName: "sso_complete" */ '../views/auth/sso-complete.vue'),
        name: 'LoginComplete',
      },
      {
        path: 'login',
        component: () =>
          import(/* webpackChunkName: "login" */ '../views/auth/login.vue'),
        name: 'Login',
      },
      {
        path: 'forgot',
        component: () => import(/* webpackChunkName: "forgot" */ '../views/auth/forgot.vue'),
        name: 'ForgotPassword',
      },
      {
        path: 'reset',
        component: () => import(/* webpackChunkName: "reset" */ '../views/auth/reset.vue'),
        name: 'ResetPassword',
      },
      {
        path: 'verify',
        component: () => import(/* webpackChunkName: "verify" */ '../views/auth/verify.vue'),
        name: 'VerifyEmail',
      },
      {
        path: 'join',
        component: () =>
          import(
            /* webpackChunkName: "register" */ '../views/auth/register.vue'
          ),
        name: 'Register',
      },
    ],
  },
  {
    path: '/credits',
    component: Credits,
    name: 'Credits',
  },
  {
    // The new match-centred game: its own full-screen page, outside the
    // manager app chrome (AppView). See docs/GAME-PHILOSOPHY.md.
    path: '/game/:clubId',
    alias: ['/games/:clubId'],
    component: () =>
      import(/* webpackChunkName: "club_game" */ '../views/game/club-game.vue'),
    name: 'Club Game',
    meta: { title: 'Play' },
  },
  {
    // The owner's guided start (phase-2 OWNER-PROGRAM-SPEC): sign a manager,
    // sign a squad, build a Tier-1, reach Level 1. Its own screen so the
    // flow can be deep-linked and screenshotted without the campus.
    path: '/game/:clubId/program',
    component: () =>
      import(/* webpackChunkName: "owner_program" */ '../views/game/owner-program.vue'),
    name: 'Owner Program',
    meta: { title: 'Owner program' },
  },
  {
    // The Pitch Grid editor (docs/coc-mapping/08 §3): the flagship tactical
    // canvas, deep-linkable with ?mode=edit|scout|review. Also reachable as a
    // campus-hub tab from /game/:clubId.
    path: '/game/:clubId/grid',
    component: () =>
      import(/* webpackChunkName: "pitch_grid" */ '../views/game/pitch-grid.vue'),
    name: 'Pitch Grid',
    meta: { title: 'Pitch grid' },
  },
  {
    // The Scout screen (docs/coc-mapping/08 §6.1): the "crack the base" surface
    // for one opponent, reached from the matchmaking opponent list.
    path: '/game/:clubId/scout/:oppId',
    component: () =>
      import(/* webpackChunkName: "scout_screen" */ '../views/game/scout.vue'),
    name: 'Scout',
    meta: { title: 'Scout' },
  },
  {
    // A manager without a club founds one here (country, town, club, crest).
    path: '/start',
    component: () =>
      import(/* webpackChunkName: "found_club" */ '../views/game/found-club.vue'),
    name: 'Found Club',
    meta: { title: 'Found your club' },
  },
  {
    // The world map: every club at its home place, competitions as venues.
    path: '/world',
    component: () =>
      import(/* webpackChunkName: "world_map" */ '../views/game/world-map.vue'),
    name: 'World Map',
    meta: { title: 'World' },
  },
  {
    path: '/games',
    alias: ['/game'],
    redirect: () => myGround() ?? '/u',
  },
  {
    path: '/',
    component: AppView,
    name: 'AppView',
    // The campus is home (docs/CORE-LOOP.md); admins and club-less managers get the office.
    redirect: () => myGround() ?? '/u',
    children: [
      {
        path: 'a',
        component: () =>
          import(/* webpackChunkName: "admin" */ '../views/admin/admin.vue'),
        children: [
          {
            path: '',
            component: () =>
              import(
                /* webpackChunkName: "admin_home" */ '../views/admin/dashboard.vue'
              ),
            name: 'Admin Home',
          },
          {
            path: 'calendar',
            component: () =>
              import(
                /* webpackChunkName: "calendar" */ '../views/admin/calendar/calendar.vue'
              ),
            name: 'Calendar',
          },
          competitions,
          clubs,
          players,
          managers,
        ],
        meta: { title: 'Admin' },
      },
      {
        path: 'u',
        component: () =>
          import(/* webpackChunkName: "user" */ '../views/user/user.vue'),
        children: [
          {
            path: '',
            component: () =>
              import(
                /* webpackChunkName: "admin" */ '../views/user/dashboard.vue'
              ),
            name: 'User Home',
            // Managers live on their campus; the old home is for admins.
            beforeEnter: () => myGround() ?? true,
          },
          {
            path: 'calendar',
            component: () =>
              import(
                /* webpackChunkName: "year_calendar" */ '../views/user/calendar/year-calendar.vue'
              ),
            name: 'Year Calendar',
          },
          {
            path: 'competitions',
            component: () =>
              import(
                /* webpackChunkName: "user_competitions" */ '../views/user/competitions/competitions.vue'
              ),
            name: 'User Competitions',
          },
          {
            path: 'competitions/:id',
            component: () =>
              import(
                /* webpackChunkName: "user_edition" */ '../views/user/competitions/edition.vue'
              ),
            name: 'User Edition',
          },
          { path: 'world', redirect: '/world' },
          {
            path: 'history',
            component: () =>
              import(
                /* webpackChunkName: "season_history" */ '../views/user/history/season-history.vue'
              ),
            name: 'Season History',
          },

          {
            path: 'fixtures',
            component: () =>
              import(
                /* webpackChunkName: "all_fixtures" */ '../views/user/seasons/fixtures.vue'
              ),
            name: 'All Fixtures',
          },
          {
            path: 'friendly',
            component: () =>
              import(
                /* webpackChunkName: "friendly_setup" */ '../views/game/friendly-setup.vue'
              ),
            name: 'Friendly Setup',
          },
          {
            path: 'stats/:type/:season_id',
            component: () =>
              import(
                /* webpackChunkName: "season_stats" */ '../views/user/seasons/stats.vue'
              ),
            name: 'Season Stats',
          },
          {
            path: 'lobby',
            component: () =>
              import(
                /* webpackChunkName: "user_lobby" */ '../views/user/lobby.vue'
              ),
            name: 'User Lobby',
          },
          {
            path: 'settings',
            component: () =>
              import(
                /* webpackChunkName: "user_settings" */ '../views/user/settings.vue'
              ),
            name: 'User Settings',
          },

          userClubRoutes,
        ],
        meta: { title: 'User' },
      },
      {
        path: '/matchzone/:fixture',
        component: () =>
          import(
            /* webpackChunkName: "matchzone" */ '../views/game/matchzone.vue'
          ),
        name: 'MatchZone',
      },
      {
        path: '/finish/edition/:id',
        component: () =>
          import(
            /* webpackChunkName: "finish_edition" */ '../views/misc/edition-finished.vue'
          ),
        name: 'Edition Finished',
      },
      { path: '/finish/season/:id', redirect: (to) => `/finish/edition/${to.params.id}` },
      {
        path: '/finish/year/:year',
        component: () =>
          import(
            /* webpackChunkName: "finish_year" */ '../views/misc/end-of-year.vue'
          ),
        name: 'Finish Year',
      },
    ],
  },
];

// Dev only: the Matchzone with a bundled demo match, for visual QA.
if (import.meta.env.DEV) {
  routes.unshift({
    path: '/dev/matchzone',
    component: () => import('../views/game/matchzone.vue'),
    name: 'MatchZoneDemo',
    props: { demo: true },
  } as RouteRecordRaw);
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

/** Signed-in managers without a club start by founding one. */
function needsClub(): boolean {
  try {
    const u = JSON.parse(window.localStorage.getItem('fspro-user') || 'null');
    return !!u && !u.isAdmin && !(u.clubs?.length > 0);
  } catch {
    return false;
  }
}

router.beforeEach((to, from, next) => {
  const isAuthenticated = Boolean(window.localStorage.getItem('fspro-user'));

  if (import.meta.env.DEV && to.path.startsWith('/dev/')) {
    next();
  } else if (!RegExp(/\/auth/).test(to.path) && !isAuthenticated) {
    next({ name: 'Auth' });
  } else if (isAuthenticated && ['/u', '/u/', '/', '/games', '/game'].includes(to.path) && needsClub()) {
    next('/start');
  } else {
    next();
  }
});

export default router;
