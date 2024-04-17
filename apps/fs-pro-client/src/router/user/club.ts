import { RouteConfig } from 'vue-router';
import ClubDashboard from '@/views/user/club/dashboard.vue';

const routes: RouteConfig = {
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
};

export default routes;
