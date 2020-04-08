import { RouteConfig } from 'vue-router';
import PlayersHome from '@/views/admin/players/dashboard.vue';
import ViewPlayer from '@/views/admin/players/view-player.vue';

const routes: RouteConfig = {
  path: 'players',
  component: () =>
    import(
      /* webpackChunkName: "players" */ '../views/admin/players/players-home.vue'
    ),
  children: [
    {
      path: '',
      component: PlayersHome,
      name: 'Players Home',
      meta: { title: 'Home' },
    },
    {
      path: ':id/:code',
      component: ViewPlayer,
      name: 'View Player',
      meta: { title: 'View Player' },
    },
  ],
};

export default routes;
