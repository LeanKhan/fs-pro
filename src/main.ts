import Vue from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import axios, { AxiosStatic } from 'axios';

Vue.use({
  install() {
    Vue.prototype.$axios = axios.create({
      baseURL: 'http://localhost:3000/api',
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
  render: h => h(App),
}).$mount('#app');
