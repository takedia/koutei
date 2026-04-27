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
 * 「新規」で作成した未保存の工程表（メモリのみ）。
 * 保存ボタンが押されるまで DB にも index にも入らない。
 * 編集画面はまずこちらを参照、なければ DB から読み込む。
 */
export const draftKoutei = writable(/** @type {import('./types.js').Koutei|null} */ (null));

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
