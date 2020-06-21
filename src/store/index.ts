import Vue from 'vue';
import Vuex from 'vuex';
import { Club } from '@/interfaces/club';
import { $axios } from '../main';
import socket from './socket';
import { ICalendar } from '@/interfaces/calendar';

Vue.use(Vuex);

// 'http://192.168.10.4:3000' - Network server url
// 'http://localhost:3000' - Local server url

// export const apiUrl = 'http://192.168.10.2:3000';

export const apiUrl = 'http://localhost:3000';

// export const apiUrl = 'http://192.168.43.33:3000';

export interface RootState {
  allClubs: Club[];
  apiUrl: string;
  user: {
    username: string;
    clubs: string[];
    isAdmin: boolean;
    userID: string;
    session: string;
    avatar: string;
    fullname: string;
  };
  calendar: ICalendar;
  seasons: any[];
  // state: MainState;
}

//   socket: SocketState;

const state = {
  allClubs: [] as Club[],
  apiUrl,
  user: {
    username: '',
    clubs: [],
    isAdmin: false,
    userID: '',
    session: '',
    avatar: '',
    fullname: '',
  },
  calendar: {} as unknown,
  seasons: [],
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
    SET_USER_CLUBS: (state, payload) => {
      state.user.clubs = payload;
    },
    SET_CALENDAR: (state, payload) => {
      state.calendar = payload;
    },
    SET_SEASONS: (state, payload) => {
      state.seasons = payload;
    },
  },
  actions: {
    SET_USER: ({ commit }, payload: RootState['user']) => {
      window.localStorage.setItem('fspro-user', JSON.stringify(payload));
      // this one is being saved as a js object, not string
      commit('SET_USER', payload);
    },
    UNSET_USER: ({ commit }) => {
      window.localStorage.removeItem('fspro-user');
      // this one is being saved as a js object, not string
      commit('SET_USER', {
        username: '',
        clubs: [],
        isAdmin: null,
        userID: '',
        session: '',
        avatar: '',
        fullname: '',
      });
    },
    GET_USER: ({ commit }) => {
      const user = JSON.parse(
        window.localStorage.getItem('fspro-user') as string
      );

      if (user)
        // this one is saved as a js object
        commit('SET_USER', user);
    },
    SET_USER_CLUBS: ({ commit, state }) => {
      if (state.user.clubs.length == 0) {
        return 'nah fam';
      }
      const query = JSON.stringify({ _id: { $in: state.user.clubs } });
      const select = JSON.stringify('ClubCode Name _id');

      $axios
        .get(`/clubs/fetch?q=${query}&select=${select}`)
        .then(response => {
          if (response.data.success) {
            commit('SET_USER_CLUBS', response.data.payload);
          }
        })
        .catch(response => {
          console.log('error => ', response);
        });
    },
    SET_CALENDAR: ({ commit }) => {
      $axios
        .get(`/calendar/current?page=1&limit=14`)
        .then(response => {
          if (response.data.success) {
            commit('SET_CALENDAR', response.data.payload);
          }
        })
        .catch(response => {
          console.log('error => ', response);
        });
    },
    SET_SEASONS: ({ commit }) => {
      $axios
        .get('/seasons/current?year=JUN-2020')
        .then(response => {
          commit('SET_SEASONS', response.data.payload);
        })
        .catch(error => {
          console.log('Error getting current seasons!', error);
        });
    },
  },
});
