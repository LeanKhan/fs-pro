import Vue from 'vue';
import Vuex from 'vuex';
import { Club } from '@/models/club';

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    allClubs: [] as Club[],
  },
  mutations: {},
  actions: {},
  modules: {},
});
