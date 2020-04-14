import Vue from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import store, { apiUrl } from './store';
import axios, { AxiosStatic } from 'axios';

// baseURL: 'http://localhost:3000/api',

Vue.use({
  install() {
    Vue.prototype.$axios = axios.create({
      baseURL: `${apiUrl}/api`,
    });
  },
});

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
