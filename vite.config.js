import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// ビルド時に埋め込む値（端末でキャッシュ世代を確認するため）
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  base: '/koutei/',
  plugins: [svelte()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME)
  },
  server: {
    host: true,
    port: 5173
  }
});
