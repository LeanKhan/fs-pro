import type { RouteRecordRaw } from 'vue-router';
import ClubDashboard from '@/views/user/club/dashboard.vue';

const routes = {
  path: 'clubs',
  component: () =>
    import(/* webpackChunkName: "clubs" */ '../../views/user/club/club.vue'),
  children: [
    {
      path: ':id/:code',
      component: ClubDashboard,
      name: 'Club Home',
      meta: { title: 'Home' },
    },
  ],
} as RouteRecordRaw;

export default routes;
