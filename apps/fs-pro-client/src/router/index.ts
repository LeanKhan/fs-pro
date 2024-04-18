import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';

/** ADMIN ROUTES */
import clubs from './clubs';
import players from './players';
import managers from './managers';
import competitions from './competitions';
// import Calendar from '@/views/admin/calendar/calendar.vue';
/** ADMIN ROUTES */

/** USER ROUTES */
import userClubRoutes from './user/club';
// import AllFixtures from '@/views/user/seasons/fixtures.vue';
/** USER ROUTES */

// import AdminHome from '@/views/admin/dashboard.vue';
import AppView from '@/views/app-view.vue';
// import UserDashboard from '@/views/user/dashboard.vue';
// import Auth from '@/views/auth/auth.vue';
// import Login from '@/views/auth/login.vue';
// import Register from '@/views/auth/register.vue';
import Credits from '@/views/credits.vue';

Vue.use(VueRouter);

export function replaceParams(
  path: string,
  replacements: { search: string; replace: string }[]
): string {
  replacements.forEach(r => {
    path.replace(r.search, r.replace);
  });

  return path;
}

const routes: RouteConfig[] = [
  {
    path: '/auth',
    component: () =>
      import(/* webpackChunkName: "auth_home" */ '../views/auth/auth.vue'),
    name: 'Auth',
    redirect: 'auth/login',
    children: [
      {
        path: 'login',
        component: () =>
          import(/* webpackChunkName: "login" */ '../views/auth/login.vue'),
        name: 'Login',
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
    path: '/',
    component: AppView,
    name: 'AppView',
    redirect: 'u',
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
        path: '/finish/season/:season_id',
        component: () =>
          import(
            /* webpackChunkName: "finish_season" */ '../views/misc/end-of-season.vue'
          ),
        name: 'Finish Season',
      },
      {
        path: '/finish/year/:calendar_id',
        component: () =>
          import(
            /* webpackChunkName: "finish_year" */ '../views/misc/end-of-year.vue'
          ),
        name: 'Finish Year',
      },
    ],
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

router.beforeEach((to, from, next) => {
  const isAuthenticated = window.localStorage.getItem('fspro-user');

  if (!RegExp(/\/auth/).test(to.path) && !isAuthenticated) {
    next({ name: 'Auth' });
  } else {
    next();
  }
});

export default router;
