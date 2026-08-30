import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { createVuetify } from 'vuetify';
import { Manager } from 'socket.io-client';
import axios from 'axios';
import { apiUrl } from '@/store';
import 'vuetify/styles';
import { mdi } from 'vuetify/iconsets/mdi';
import { ordinal, roundTo } from './helpers/misc';
import { customIcons } from './plugins/customIcons';

const manager = new Manager(apiUrl, { autoConnect: false });

manager.socket('/');

export const $axios = axios.create({
  baseURL: `${apiUrl}/api`,
});

const vuetify = createVuetify({
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
  icons: {
    defaultSet: 'mdi',
    sets: {
      mdi,
      custom: customIcons,
    },
  },
});

const formatter = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 2,
});

const app = createApp(App);

app.config.globalProperties.$socket = manager;
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
