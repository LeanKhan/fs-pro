import type { RouteRecordRaw } from 'vue-router';

/** Admin: open-play competitions (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). A
 * competition's editions are managed on its own page. */
const routes = {
  path: 'competitions',
  component: () =>
    import(
      /* webpackChunkName: "competitions" */ '../views/admin/competitions/competition-home.vue'
    ),
  children: [
    {
      path: '',
      name: 'Competition Home',
      component: () =>
        import(
          /* webpackChunkName: "competitions_list" */ '../views/admin/open-play/competitions-list.vue'
        ),
      meta: { title: 'Competitions' },
    },
    {
      path: 'new',
      name: 'New Competition',
      component: () =>
        import(
          /* webpackChunkName: "competition_builder" */ '../views/admin/open-play/competition-builder.vue'
        ),
      props: { isUpdate: false },
      meta: { title: 'New Competition' },
    },
    {
      path: ':id/:code',
      name: 'View Competition',
      component: () =>
        import(
          /* webpackChunkName: "competition_view" */ '../views/admin/open-play/competition-view.vue'
        ),
      meta: { title: 'Competition' },
    },
    {
      path: ':id/:code/update',
      name: 'Update Competition',
      component: () =>
        import(
          /* webpackChunkName: "competition_builder" */ '../views/admin/open-play/competition-builder.vue'
        ),
      props: { isUpdate: true },
      meta: { title: 'Update' },
    },
  ],
  meta: { title: 'Competitions' },
} as RouteRecordRaw;

export default routes;
