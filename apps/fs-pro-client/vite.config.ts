import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  server: {
    port: 8080,
  },
  define: {
    'process.env.NODE_ENV': '"development"',
    'process.env.SITE_NAME': '"FSPro"',
  },
});