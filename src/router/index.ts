import Vue from 'vue';
import VueRouter, { RouteConfig, Route } from 'vue-router';
import Home from '../views/Home.vue';
import CompetitionsHome from '../views/competitions/dashboard.vue';
import CompetitionSeasonsHome from '../views/seasons/dashboard.vue';
import ViewCompetition from '@/views/competitions/view-competition.vue';
import CompetitionForm from '@/views/competitions/competition-form.vue';
import CompetitionHome from '@/views/competitions/competition-home.vue';
import SeasonForm from '@/views/seasons/season-form.vue';
import SeasonHome from '@/views/seasons/view-season.vue';
// import Clubs from '../views/Clubs.vue';

Vue.use(VueRouter);

function replaceParams(
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
    name: 'Home',
    component: Home,
  },
  {
    path: '/clubs',
    name: 'Clubs',
    component: () =>
      import(/* webpackChunkName: "clubs" */ '../views/Clubs.vue'),
  },
  {
    path: '/competitions',
    component: () =>
      import(
        /* webpackChunkName: "competitions" */ '../views/competitions/Competitions.vue'
      ),
    children: [
      {
        path: '',
        name: 'Competition Home',
        component: CompetitionsHome,
        meta: { title: 'Home' },
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
                /* webpackChunkName: "seasons" */ '../views/seasons/seasons-home.vue'
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
        name: 'Create Competition',
        component: CompetitionForm,
        meta: { title: 'Create Competition' },
        props: { isUpdate: false },
      },
    ],
    meta: { title: 'Competitions' },
  },
  {
    path: '/players',
    name: 'Players',
    component: () =>
      import(/* webpackChunkName: "players" */ '../views/Players.vue'),
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

export default router;
