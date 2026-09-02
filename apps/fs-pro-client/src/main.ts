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
