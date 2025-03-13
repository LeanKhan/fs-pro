import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { io } from 'socket.io-client';
import axios from 'axios';
import { apiUrl } from './stores/main';
import 'vuetify/styles';

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
  roundTo: (value: number, decimals: number) => Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals),
  ordinal: (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
};

app.mount('#app');