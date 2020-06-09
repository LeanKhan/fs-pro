import { RootState } from '.';
import { Module } from 'vuex';

export interface SocketState {
  poop: string;
}

export const state: SocketState = {
  poop: '',
};

const socket: Module<SocketState, RootState> = {
  namespaced: true,
  state,
  getters: {
    poop: state => {
      return state.poop;
    },
  },
  mutations: {},
  actions: {},
};

export default socket;
