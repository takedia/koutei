import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// 新デプロイ後に古いチャンク URL を要求してしまい
// 「Failed to fetch dynamically imported module」が発生したら強制リロード。
// 連続発火を防ぐためフラグを sessionStorage に置く。
export function isStaleChunkError(/** @type {unknown} */ err) {
  const msg = String(/** @type {any} */ (err)?.message ?? err ?? '');
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
}
export function reloadOnceForStaleChunk() {
  if (sessionStorage.getItem('koutei.reloaded-once') === '1') return false;
  sessionStorage.setItem('koutei.reloaded-once', '1');
  location.reload();
  return true;
}
window.addEventListener('error', e => {
  if (isStaleChunkError(e.error ?? e.message)) reloadOnceForStaleChunk();
});
window.addEventListener('unhandledrejection', e => {
  if (isStaleChunkError(e.reason)) reloadOnceForStaleChunk();
});
// 正常起動した時点でフラグを解除（次回のために）
window.addEventListener('load', () => sessionStorage.removeItem('koutei.reloaded-once'));

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
