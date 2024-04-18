import { RouteConfig, Route } from 'vue-router';
import CompetitionsHome from '@/views/admin/competitions/dashboard.vue';
import CompetitionSeasonsHome from '@/views/admin/seasons/dashboard.vue';
import ViewCompetition from '@/views/admin/competitions/view-competition.vue';
import CompetitionForm from '@/views/admin/competitions/competition-form.vue';
import CompetitionHome from '@/views/admin/competitions/competition-home.vue';
import SeasonForm from '@/views/admin/seasons/season-form.vue';
import SeasonHome from '@/views/admin/seasons/view-season.vue';
import { replaceParams } from './index';

const routes: RouteConfig = {
  path: 'competitions',
  component: () =>
    import(
      /* webpackChunkName: "competitions" */ '../views/admin/competitions/Competitions.vue'
    ),
  children: [
    {
      path: '',
      name: 'Competition Home',
      component: CompetitionsHome,
      meta: () => ({
        title: 'Home',
      }),
    },
    {
      path: ':id/:code',
      component: CompetitionHome,
      children: [
        {
          path: '',
          name: 'View Competition',
          component: ViewCompetition,
          meta: (route: Route) => ({
            title: route.params.code.toUpperCase(),
            to: () => {
              return replaceParams(route.path, [
                { search: ':id', replace: route.params.id },
                { search: ':code', replace: route.params.code },
              ]);
            },
          }),
        },
        {
          path: 'update',
          name: 'Update Competition',
          component: CompetitionForm,
          meta: (route: Route) => ({
            title: 'Update',
            to: () => {
              return replaceParams(route.path, [
                { search: ':id', replace: route.params.id },
                { search: ':code', replace: route.params.code },
              ]);
            },
          }),
          props: { isUpdate: true },
        },
        {
          path: 'seasons',
          component: () =>
            import(
              /* webpackChunkName: "seasons" */ '../views/admin/seasons/seasons-home.vue'
            ),
          children: [
            {
              path: '',
              component: CompetitionSeasonsHome,
              name: 'Seasons Home',
            },
            {
              path: ':seasonId/:seasonCode',
              component: SeasonHome,
              name: 'View Season',
            },
            {
              path: 'new',
              name: 'New Season',
              component: SeasonForm,
              meta: (route: Route) => ({
                title: 'New Season',
                to: () => {
                  return replaceParams(route.path, [
                    { search: ':id', replace: route.params.id },
                    { search: ':code', replace: route.params.code },
                  ]);
                },
              }),
            },
          ],
          meta: { title: 'Seasons' },
        },
      ],
      meta: (route: Route) => ({
        title: route.params.code.toUpperCase(),
        to: () => {
          return replaceParams(route.path, [
            { search: ':id', replace: route.params.id },
            { search: ':code', replace: route.params.code },
          ]);
        },
      }),
    },
    {
      path: 'new',
      name: 'New Competition',
      component: CompetitionForm,
      meta: { title: 'New Competition' },
      props: { isUpdate: false },
    },
  ],
  meta: () => ({
    title: 'Competitions Home',
  }),
};
export default routes;
