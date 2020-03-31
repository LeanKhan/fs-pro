import Vue from 'vue';
import VueRouter from 'vue-router';
import Home from '../views/Home.vue';
import CompetitionsHome from '../views/competitions/dashboard.vue';
import ViewCompetition from '@/views/competitions/view-competition.vue';
import CompetitionForm from '@/views/competitions/competition-form.vue';
// import Clubs from '../views/Clubs.vue';

Vue.use(VueRouter);

const routes = [
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
      { path: '', name: 'CompetitionsHome', component: CompetitionsHome },
      {
        path: 'view/:id/:code',
        name: 'View Competition',
        component: ViewCompetition,
        meta: { title: 'View Component' },
      },
      {
        path: 'update/:id/:code',
        name: 'Update Competition',
        component: CompetitionForm,
        meta: { title: 'Update Competition' },
        props: { isUpdate: true },
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
