import { RouteConfig } from 'vue-router';
// import PlayersHome from '@/views/admin/players/dashboard.vue';
// import ViewPlayer from '@/views/admin/players/view-player.vue';
// import PlayerForm from '@/views/admin/players/players-form.vue';
// import PlayerHome from '@/views/admin/players/player-home.vue';

const routes: RouteConfig = {
  path: 'players',
  component: () =>
    import(
      /* webpackChunkName: "players" */ '../views/admin/players/players-home.vue'
    ),
  children: [
    {
      path: '',
      component: () =>
        import(
          /* webpackChunkName: "players_home" */ '../views/admin/players/dashboard.vue'
        ),
      name: 'Players Home',
      meta: { title: 'Players Dashboard' },
    },
    {
      path: 'new',
      name: 'New Player',
      component: () =>
        import(
          /* webpackChunkName: "players_form" */ '../views/admin/players/players-form.vue'
        ),
      meta: { title: 'New Player' },
    },
    {
      path: ':id/:code',
      component: () =>
        import(
          /* webpackChunkName: "player_home" */ '../views/admin/players/player-home.vue'
        ),
      children: [
        {
          path: '',
          component: () =>
            import(
              /* webpackChunkName: "view_player" */ '../views/admin/players/view-player.vue'
            ),
          name: 'View Player',
          meta: { title: 'View Player' },
        },
        {
          path: 'update',
          name: 'Update Player',
          component: () =>
            import(
              /* webpackChunkName: "players_form" */ '../views/admin/players/players-form.vue'
            ),
          meta: { title: 'Update Player' },
          props: { isUpdate: true },
        },
      ],
    },
  ],
};

export default routes;
