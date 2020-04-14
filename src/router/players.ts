import { RouteConfig } from 'vue-router';
import PlayersHome from '@/views/admin/players/dashboard.vue';
import ViewPlayer from '@/views/admin/players/view-player.vue';
import PlayerForm from '@/views/admin/players/players-form.vue';

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
      path: 'new',
      name: 'New Player',
      component: PlayerForm,
      meta: { title: 'New Player' },
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
