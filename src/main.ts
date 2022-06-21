import Vue from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import store, { apiUrl } from './store';
import axios, { AxiosStatic } from 'axios';
import { roundTo, ordinal } from './helpers/misc';

import VueSocketIOExt from 'vue-socket.io-extended';
import io from 'socket.io-client';

const socket = io(`${apiUrl}`, { autoConnect: false });

Vue.use(VueSocketIOExt, socket);

// baseURL: 'http://localhost:3000/api',

export const $axios = axios.create({
  baseURL: `${apiUrl}/api`,
});

Vue.use({
  install() {
    Vue.prototype.$axios = $axios;
  },
});

const formatter = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
});


Vue.filter('currency', (value: number) => `${formatter.format(value)}`);

Vue.filter('roundTo', roundTo);

Vue.filter('ordinal', ordinal);

declare module 'vue/types/vue' {
  interface Vue {
    $axios: AxiosStatic;
  }
}

Vue.config.productionTip = false;

new Vue({
  vuetify,
  router,
  store,
  render: h => h(App),
}).$mount('#app');
