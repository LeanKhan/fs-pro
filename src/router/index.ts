import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import competitionRoutes from './competitions';
import clubRoutes from './clubs';
import playerRoutes from './players';
import AdminHome from '@/views/admin/dashboard.vue';
import AppView from '@/views/app-view.vue';
import UserDashboard from '@/views/user/dashboard.vue';
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
    path: '/',
    component: AppView,
    name: 'AppView',
    redirect: 'a',
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
        children: [{ path: '', component: UserDashboard, name: 'User Home' }],
        meta: { title: 'User' },
      },
    ],
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [...routes],
});

export default router;
