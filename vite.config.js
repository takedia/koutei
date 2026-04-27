import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: '/koutei/',
  plugins: [svelte()],
  server: {
    host: true,
    port: 5173
  }
});
