import { RouteConfig } from 'vue-router';
import PlayersHome from '@/views/admin/players/dashboard.vue';
import ViewPlayer from '@/views/admin/players/view-player.vue';
import PlayerForm from '@/views/admin/players/players-form.vue';
import PlayerHome from '@/views/admin/players/player-home.vue';

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
      component: PlayerHome,
      children: [
        {
          path: '',
          component: ViewPlayer,
          name: 'View Player',
          meta: { title: 'View Player' },
        },
        {
          path: 'update',
          name: 'Update Player',
          component: PlayerForm,
          meta: { title: 'Update Player' },
          props: { isUpdate: true },
        },
      ],
    },
  ],
};

export default routes;
