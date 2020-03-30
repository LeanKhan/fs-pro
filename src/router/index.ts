import Vue from 'vue';
import VueRouter from 'vue-router';
import Home from '../views/Home.vue';
import CompetitionsHome from '../views/competitions/dashboard.vue';
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
    ],
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
