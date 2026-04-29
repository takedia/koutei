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

// Service Worker（ダウンロード仮想 URL 配信用）。iOS Safari で
// blob URL の <a download> が .txt 化する問題を回避するため。
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
    .catch(err => console.warn('SW registration failed', err));
}

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
