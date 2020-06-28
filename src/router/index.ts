import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import competitionRoutes from './competitions';
import clubRoutes from './clubs';
import playerRoutes from './players';
import AdminHome from '@/views/admin/dashboard.vue';
import AppView from '@/views/app-view.vue';
import UserDashboard from '@/views/user/dashboard.vue';
import Auth from '@/views/auth/auth.vue';
import Login from '@/views/auth/login.vue';
import Register from '@/views/auth/register.vue';
import Credits from '@/views/credits.vue';

/** USER ROUTES */
import userClubRoutes from './user/club';
/** USER ROUTES */

// import Clubs from '../views/Clubs.vue';

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
    component: Auth,
    name: 'Auth',
    redirect: 'auth/login',
    children: [
      { path: 'login', component: Login, name: 'Login' },
      { path: 'join', component: Register, name: 'Register' },
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
          { path: '', component: AdminHome, name: 'Admin Home' },
          competitionRoutes,
          clubRoutes,
          playerRoutes,
        ],
        meta: { title: 'Admin' },
      },
      {
        path: 'u',
        component: () =>
          import(/* webpackChunkName: "user" */ '../views/user/user.vue'),
        children: [
          { path: '', component: UserDashboard, name: 'User Home' },
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
