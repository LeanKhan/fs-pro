import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { io } from 'socket.io-client';
import axios from 'axios';
import { apiUrl } from '@/store';
import 'vuetify/styles';
import { ordinal, roundTo } from './helpers/misc';

const socket = io(apiUrl, { autoConnect: false });

export const $axios = axios.create({
  baseURL: `${apiUrl}/api`,
});

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#7535ed',
          accent: '#c23361',
          anchor: '#340f78',
        },
      },
    },
  },
});

const formatter = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 2,
});

const app = createApp(App);

app.config.globalProperties.$socket = socket;
app.config.globalProperties.$axios = $axios;

app.use(createPinia());
app.use(router);
app.use(vuetify);

// Global filters
app.config.globalProperties.$filters = {
  currency: (value: number) => `${formatter.format(value)}`,
  roundTo: roundTo,
  ordinal: ordinal,
};

app.mount('#app');
