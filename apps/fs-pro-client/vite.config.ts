import { defineConfig } from 'vite';
import { resolve } from 'path';
import { createVuePlugin } from 'vite-plugin-vue2';
import Components from 'unplugin-vue-components/vite';
import { VuetifyResolver } from 'unplugin-vue-components/resolvers';

const rollupOptions = {};

const alias = [
  { find: /^~/, replacement: '' },
  { find: 'vue', replacement: 'vue/dist/vue.esm' },
  {
    find: '@',
    replacement: resolve(__dirname, './src'),
  },
];

const proxy = {};

const define = {
  'process.env.NODE_ENV': '"development"',
  'precess.env.SITE_NAME': '"FSPro"',
};

const esbuild = {};

export default defineConfig({
  resolve: {
    alias,
    extensions: [
      '.mjs',
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.json',
      '.vue',
      '.styl',
    ],
    dedupe: ['vue-demi'],
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    manifest: false,
    sourcemap: false,
    outDir: 'build',
    rollupOptions,
  },
  esbuild,
  server: {
    proxy,
    port: 8080,
  },
  define,
  plugins: [
    createVuePlugin({
      vueTemplateOptions: {
        compilerOptions: {
          whitespace: 'condense',
        },
      },
    }),
    Components({
      resolvers: [VuetifyResolver()],
    }),
  ],
});
