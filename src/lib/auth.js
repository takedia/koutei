// アプリ全体のパスワードゲート
// - 認証情報は GitHub 上の data/auth.json から実行時取得
// - 通過情報は localStorage に保存しないので、再読み込みのたびに入力が必要

import { writable } from 'svelte/store';

/** 認証情報 JSON の取得 URL（main ブランチの raw を直接見る） */
const AUTH_URL = 'https://raw.githubusercontent.com/takedia/koutei/main/data/auth.json';

/** 認証済みフラグ（セッション内のみ、メモリのみ） */
export const authed = writable(false);

/** 取得失敗時にユーザーに見せる詳細 */
export const authError = writable(/** @type {string|null} */ (null));

/**
 * 文字列を SHA-256 で hex 化
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * auth.json を fetch してハッシュを取り出す
 * @returns {Promise<{passwordHash: string} | null>}
 */
export async function fetchAuthInfo() {
  try {
    // raw.githubusercontent は GitHub の CDN で 5 分程度キャッシュされる
    const res = await fetch(AUTH_URL, { cache: 'no-cache' });
    if (!res.ok) {
      authError.set(`認証情報の取得に失敗（HTTP ${res.status}）`);
      return null;
    }
    const data = await res.json();
    if (typeof data?.passwordHash !== 'string') {
      authError.set('認証情報の形式が正しくありません');
      return null;
    }
    authError.set(null);
    return data;
  } catch (e) {
    authError.set('認証情報の取得に失敗（オフライン?）');
    return null;
  }
}

/**
 * 入力されたパスワードを照合
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password) {
  const info = await fetchAuthInfo();
  if (!info) return false;
  const inputHash = await sha256Hex(password);
  // 大文字小文字を吸収
  return inputHash.toLowerCase() === info.passwordHash.toLowerCase();
}
