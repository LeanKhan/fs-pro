import Vue from 'vue';
import Vuex from 'vuex';
import { Club } from '@/models/club';
import socket, { SocketState } from './socket';

Vue.use(Vuex);

// 'http://192.168.10.4:3000' - Network server url
// 'http://localhost:3000' - Local server url

// export const apiUrl = 'http://192.168.10.4:3000';

export const apiUrl = 'http://localhost:3000';

export interface RootState {
  allClubs: Club[];
  apiUrl: string;
  user: {};
  socket: SocketState;
}

const state = {
  allClubs: [] as Club[],
  apiUrl,
  user: {},
} as RootState;

export default new Vuex.Store({
  state,
  modules: {
    socket,
  },
  getters: {
    apiUrl: state => {
      return state.apiUrl;
    },
    user: state => {
      return state.user;
    },
  },
  mutations: {
    SET_USER: (state, payload) => {
      state.user = payload;
    },
  },
  actions: {
    SET_USER: ({ commit }, payload) => {
      window.localStorage.setItem('fspro-user', JSON.stringify(payload));
      // this one is being saved as a js object, not string
      commit('SET_USER', payload);
    },
    UNSET_USER: ({ commit }) => {
      window.localStorage.removeItem('fspro-user');
      // this one is being saved as a js object, not string
      commit('SET_USER', {});
    },
    GET_USER: ({ commit }) => {
      const user = JSON.parse(
        window.localStorage.getItem('fspro-user') as string
      );

      if (user)
        // this one is saved as a js object
        commit('SET_USER', user);
    },
  },
});
