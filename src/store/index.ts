import Vue from 'vue';
import Vuex from 'vuex';
import { Club } from '@/models/club';

Vue.use(Vuex);

// 'http://192.168.10.4:3000' - Network server url
// 'http://localhost:3000' - Local server url

// export const apiUrl = 'http://192.168.10.4:3000';

export const apiUrl = 'http://localhost:3000';

export default new Vuex.Store({
  state: {
    allClubs: [] as Club[],
    apiUrl,
  },
  getters: {
    apiUrl: state => {
      return state.apiUrl;
    },
  },
  mutations: {},
  actions: {},
  modules: {},
});
