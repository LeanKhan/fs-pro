import { RouteConfig } from 'vue-router';
import ClubsDashboard from '@/views/admin/clubs/dashboard.vue';
import ViewClub from '@/views/admin/clubs/view-club.vue';

const routes: RouteConfig = {
  path: 'clubs',
  component: () =>
    import(
      /* webpackChunkName: "clubs" */ '../views/admin/clubs/clubs-home.vue'
    ),
  children: [
    {
      path: '',
      component: ClubsDashboard,
      name: 'Clubs Home',
      meta: { title: 'Home' },
    },
    {
      path: ':id/:code',
      component: ViewClub,
      name: 'View Club',
      meta: { title: 'View Club' },
    },
  ],
};

export default routes;
