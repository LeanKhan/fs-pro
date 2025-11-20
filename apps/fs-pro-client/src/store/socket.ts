import { defineStore } from 'pinia';

export interface SocketState {
  poop: string;
}

export const useSocketStore = defineStore('socket', {
  state: (): SocketState => ({
    poop: '',
  }),
  getters: {
    poop: (state) => state.poop,
  },
  actions: {
    // Add actions here if needed
  },
});
