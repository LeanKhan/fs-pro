import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [vue(), vuetify({ autoImport: true })],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          vuetify: ['vuetify'],
          vendor: ['@vueuse/core', 'axios', 'socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 8080,
    fs: {
      allow: ['../..'],
    },
  },
  define: {
    // Follow the build mode: a hard-coded "development" here shipped Vue's dev build in production.
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.SITE_NAME': '"FSPro"',
  },
}));
