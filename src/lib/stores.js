// アプリ全体の状態（Svelte stores）
import { writable } from 'svelte/store';

/**
 * 画面切り替え（簡易ルータ）
 * 'home' | 'editor' | 'settings' | 'preview'
 */
export const screen = writable(/** @type {'home'|'editor'|'settings'|'preview'} */ ('home'));

/**
 * 現在編集中の工程表 id（編集画面に渡す）
 */
export const editingId = writable(/** @type {string|null} */ (null));

/**
 * トースト通知
 */
function createToasts() {
  const { subscribe, update } = writable(/** @type {{id:number, msg:string, kind:'info'|'error'}[]} */ ([]));
  let seq = 0;
  return {
    subscribe,
    /** @param {string} msg */
    info(msg) {
      const id = ++seq;
      update(arr => [...arr, { id, msg, kind: 'info' }]);
      setTimeout(() => update(arr => arr.filter(t => t.id !== id)), 2500);
    },
    /** @param {string} msg */
    error(msg) {
      const id = ++seq;
      update(arr => [...arr, { id, msg, kind: 'error' }]);
      setTimeout(() => update(arr => arr.filter(t => t.id !== id)), 4000);
    }
  };
}
export const toasts = createToasts();
