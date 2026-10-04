import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { createVuetify } from 'vuetify';
import { $axios } from '@/services/api';
import { appSocket } from '@/services/socket';
import 'vuetify/styles';
import { mdi } from 'vuetify/iconsets/mdi';
import { currency, ordinal, roundTo } from './helpers/misc';
import { customIcons } from './plugins/customIcons';
import { useStore } from './store';
import { VueQueryPlugin } from '@tanstack/vue-query';

export { $axios };

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
      // The campus palette (components/cozy/cozy.scss), for dashboard screens
      // opened over the campus.
      cozy: {
        dark: false,
        colors: {
          background: '#fdf4df',
          surface: '#fffaf0',
          'on-surface': '#4a3220',
          'surface-variant': '#f6e7c4',
          'on-surface-variant': '#4a3220',
          'on-background': '#4a3220',
          primary: '#3fa526',
          secondary: '#8a5a3b',
          accent: '#f2b632',
          error: '#e5402f',
          warning: '#f2b632',
          info: '#3a8ee0',
          success: '#3fa526',
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

const app = createApp(App);

app.config.globalProperties.$socket = appSocket;
app.config.globalProperties.$axios = $axios;

app.use(createPinia());
app.use(router);
app.use(vuetify);
app.use(VueQueryPlugin);

// A component throwing during render/update otherwise fails silently -
// vue-router has already committed the URL by the time the new view's
// render throws, so without this the visible symptom is "the route
// changed but the page never rendered." Surface the existing error
// overlay instead so there's always a way back.
app.config.errorHandler = (err, _instance, info) => {
  console.error('[global error]', err, {
    info,
    route: router.currentRoute.value.path,
  });
  useStore().setErrorOverlay(true);
};

// Global filters
app.config.globalProperties.$filters = {
  currency,
  roundTo: roundTo,
  ordinal: ordinal,
};

app.mount('#app');
