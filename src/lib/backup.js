// JSON バックアップ（端末ローカル → ファイル）
//
// 形式:
//   { version: 1, exportedAt: ISO, kouteis: Koutei[], settings: 設定 }
//
// 復元時はファイルを読み込んで saveKoutei / saveSettings に流すだけ。

import { get, keys } from 'idb-keyval';
import { saveKoutei, saveSettings, loadSettings } from './db.js';
import { migrateKoutei } from './types.js';

const PREFIX = 'koutei:';

/** 全工程表 + 設定 を JSON 化 */
export async function exportAllAsJson() {
  const ks = await keys();
  /** @type {any[]} */
  const kouteis = [];
  for (const k of ks) {
    if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue;
    const raw = await get(k);
    if (raw) kouteis.push(raw);
  }
  const settings = await loadSettings();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    kouteis,
    settings
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * JSON 文字列から復元。既存 ID は上書き。
 * @param {string} jsonText
 * @param {{ overwrite?: boolean, includeSettings?: boolean }} [opts]
 * @returns {Promise<{ kouteiCount: number, settingsRestored: boolean }>}
 */
export async function importFromJson(jsonText, opts = {}) {
  const { overwrite = true, includeSettings = true } = opts;
  const data = JSON.parse(jsonText);
  if (!data || typeof data !== 'object') throw new Error('JSON 形式が不正です');

  /** @type {any[]} */
  let list = [];
  if (Array.isArray(data.kouteis)) list = data.kouteis;
  else if (data.id && data.工事ブロック) list = [data]; // 単一工程表
  else throw new Error('工程表データが見つかりません');

  let count = 0;
  for (const raw of list) {
    if (!raw?.id) continue;
    const k = migrateKoutei(raw);
    if (!overwrite) {
      const existing = await get(PREFIX + k.id);
      if (existing) continue;
    }
    await saveKoutei(k);
    count++;
  }

  let settingsRestored = false;
  if (includeSettings && data.settings && typeof data.settings === 'object') {
    await saveSettings(data.settings);
    settingsRestored = true;
  }
  return { kouteiCount: count, settingsRestored };
}
