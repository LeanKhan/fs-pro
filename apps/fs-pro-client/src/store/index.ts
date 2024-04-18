import Vue from 'vue';
import Vuex from 'vuex';
import { Club } from '@/interfaces/club';
import { $axios } from '../main';
import socket from './socket';
import { ICalendar } from '@/interfaces/calendar';

Vue.use(Vuex);

// 'http://192.168.10.4:3000' - Network server url
// 'http://localhost:3000' - Local server url

// export const apiUrl = 'http://192.168.0.137:3000';

export const apiUrl = import.meta.env.VITE_APP_API_BASE_URL;
// export const apiUrl = 'http://localhost:3000';

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
  countries: string[];
  seasons: any[];
  toast: {
    show: boolean;
    style: '';
    actionText: '';
    actionLink: '';
    message: '';
    withAction: boolean;
  };
  errorOverlay: boolean;
  lobby: boolean;
  /** The Competition._id of selected League */
  selectedLeague: string;
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
  countries: [],
  toast: {
    show: false,
    message: '',
    style: '',
    actionText: '',
    actionLink: '',
    withAction: false,
  },
  errorOverlay: false,
  lobby: false,
  // new
  selectedLeague: ''
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
    currentYear: state => {
      return state.YearString;
    },
    countries: state => {
      return state.countries;
    },
    toast: state => {
      return state.toast;
    },
    lobby: state => {
      return state.lobby;
    },
    errorOverlay: state => {
      return state.errorOverlay;
    },
    selectedLeague: state => {
      return state.selectedLeague;
    }
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
    SET_COUNTRIES: (state, payload) => {
      state.countries = payload;
    },
    SET_SELECTED_LEAGUE: (state, payload) => {
      // must be a valid MongoDB ObjectId
      state.selectedLeague = payload;
    },
    SET_LOBBY: (state, payload) => {
      state.lobby = payload;
    },
    SHOW_TOAST: (
      state,
      { message, style, actionText, actionLink, withAction }
    ) => {
      state.toast.show = true;
      state.toast.message = message;
      state.toast.style = style;
      state.toast.actionText = actionText;
      state.toast.actionLink = actionLink;
      state.toast.withAction = withAction;
    },
    HIDE_TOAST: state => {
      state.toast.show = false;
      state.toast.message = '';
      state.toast.style = '';
      state.toast.actionText = '';
      state.toast.actionLink = '';
      state.toast.withAction = false;
    },
    TOGGLE_ERROR_OVERLAY: state => {
      state.errorOverlay = !state.errorOverlay;
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
    SET_SELECTED_LEAGUE: ({ commit }, payload: string) => {
      // window.localStorage.setItem('fspro-selected-league', payload);
      commit('SET_SELECTED_LEAGUE', payload);
    },
    UNSET_SELECTED_LEAGUE: ({ commit }, payload: string) => {
      // window.localStorage.removeItem('fspro-selected-league');
      commit('SET_SELECTED_LEAGUE', '');
    },
    // GET_SELECTED_LEAGUE: ({ commit }, payload: string) => {
    //  const user = window.localStorage.getItem('fspro-selected-league') as string;

    //   if (league)
    //     // this one is saved as a js object
    //     commit('SET_SELECTED_LEAGUE', league);
    // },
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
    SET_CALENDAR: ({ commit, dispatch }) => {
      $axios
        .get(`/calendar/current?page=1&limit=14&populate=false`)
        .then(response => {
          if (response.data.success) {
            commit('SET_CALENDAR', response.data.payload);
            // Maybe after this, get Current Seasons based on this year?
            commit('SET_LOBBY', !response.data.payload.YearString);

            // we should focus on a season at a time!
            // dispatch('SET_SEASONS');
          }
        })
        .catch(response => {
          console.log('error => ', response);
        });
    },
    SET_SEASONS: ({ commit }) => {
      if (state.calendar.YearString) {
        $axios
          .get(`/seasons/${state.calendar.YearString}/current`)
          .then(response => {
            commit('SET_SEASONS', response.data.payload);
          })
          .catch(error => {
            console.log('Error getting current seasons!', error);
          });
      }
    },
    GET_COUNTRIES: ({ commit }) => {
      $axios
        .get('/places/country')
        .then(res => {
          commit('SET_COUNTRIES', res.data.payload);
        })
        .catch(error => {
          console.log('Error getting countries!', error);
        });
    },
    SHOW_TOAST: ({ commit }, payload) => {
      commit('SHOW_TOAST', payload);
    },
    HIDE_TOAST: ({ commit }) => {
      commit('HIDE_TOAST');
    },
  },
});
