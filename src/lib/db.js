// IndexedDB 永続化層（idb-keyval ベース）
// キー設計：
//   koutei:{id}   ← 工程表本体
//   index         ← 一覧用メタ配列（[{id, 工事名, 期間, 月, 更新}...]）
//   settings      ← 設定オブジェクト
//
// 一覧画面の高速描画のため、本体とは別に index を持つ（誤差はほぼないが片方失敗時は再構築が必要）。

import { get, set, del, keys } from 'idb-keyval';
import { KOUSHU_DEFAULT } from './data/koushu.js';
import { migrateKoutei } from './types.js';

const PREFIX = 'koutei:';

/**
 * @typedef {Object} IndexEntry
 * @property {string} id
 * @property {string} 工事名表示    // 複数工事をまとめた表示名（"工事A 他1件" 等）
 * @property {string} 月            // YYYY-MM（開始月。後方互換のため残置）
 * @property {string} [終了月]      // YYYY-MM（終了月。月をまたぐ時に開始月と異なる）
 * @property {string} 期間表示      // "2026-04-22 - 05-05"
 * @property {'2週'|'月間'} 提出種別
 * @property {string} 最終更新      // ISO datetime
 */

/**
 * 一覧を取得（更新日降順）
 * 旧形式（終了月なし）のエントリは本体から補完して移行する。
 * @returns {Promise<IndexEntry[]>}
 */
export async function loadIndex() {
  /** @type {IndexEntry[]} */
  const idx = (await get('index')) ?? [];
  // 終了月が無いエントリを本体から補完（月またぎ表示のため）
  let mutated = false;
  for (const e of idx) {
    if (!e.終了月) {
      try {
        const koutei = /** @type {any} */ (await get(PREFIX + e.id));
        const end = koutei?.meta?.対象期間?.終了;
        if (typeof end === 'string' && end.length >= 7) {
          e.終了月 = end.slice(0, 7);
          mutated = true;
        }
      } catch {}
    }
  }
  if (mutated) await set('index', idx);
  return [...idx].sort((a, b) => (a.最終更新 < b.最終更新 ? 1 : -1));
}

/** 一覧を月別グルーピング（月をまたぐ工程表は両方の月に出る） */
export async function loadIndexByMonth() {
  const idx = await loadIndex();
  /** @type {Map<string, IndexEntry[]>} */
  const m = new Map();
  for (const e of idx) {
    const months = new Set([e.月]);
    if (e.終了月 && e.終了月 !== e.月) months.add(e.終了月);
    for (const mm of months) {
      const arr = m.get(mm) ?? [];
      arr.push(e);
      m.set(mm, arr);
    }
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/**
 * 工程表本体取得（旧バージョン形式は読み込み時に移行）
 * @param {string} id
 * @returns {Promise<import('./types.js').Koutei | undefined>}
 */
export async function loadKoutei(id) {
  const raw = await get(PREFIX + id);
  return raw ? migrateKoutei(raw) : raw;
}

/**
 * 保存（本体＋index 同時更新）
 * Svelte 5 の $state プロキシも安全に保存できるよう JSON 経由でプレーン化する。
 * @param {import('./types.js').Koutei} koutei
 * @returns {Promise<import('./types.js').Koutei>}
 */
export async function saveKoutei(koutei) {
  const plain = JSON.parse(JSON.stringify(koutei));
  plain.meta.最終更新 = new Date().toISOString();
  plain.meta.版数 = (plain.meta.版数 ?? 0) + 1;
  await set(PREFIX + plain.id, plain);
  await upsertIndex(plain);
  return plain;
}

/**
 * 削除
 * @param {string} id
 */
export async function deleteKoutei(id) {
  await del(PREFIX + id);
  /** @type {IndexEntry[]} */
  const idx = (await get('index')) ?? [];
  await set('index', idx.filter(e => e.id !== id));
}

/**
 * @param {import('./types.js').Koutei} koutei
 */
async function upsertIndex(koutei) {
  /** @type {IndexEntry[]} */
  const idx = (await get('index')) ?? [];
  const names = koutei.工事ブロック
    .map(b => b.工事名 || b.工事番号)
    .filter(n => n);
  const 工事名表示 = names.length === 0
    ? '(無題)'
    : names.length === 1
      ? names[0]
      : `${names[0]} 他${names.length - 1}件`;
  const entry = {
    id: koutei.id,
    工事名表示,
    月: koutei.meta.対象期間.開始.slice(0, 7),
    終了月: koutei.meta.対象期間.終了.slice(0, 7),
    期間表示: `${koutei.meta.対象期間.開始} - ${koutei.meta.対象期間.終了.slice(5)}`,
    提出種別: koutei.meta.提出種別,
    最終更新: koutei.meta.最終更新
  };
  const i = idx.findIndex(e => e.id === koutei.id);
  if (i >= 0) idx[i] = entry; else idx.push(entry);
  await set('index', idx);
}

/**
 * インデックス再構築（壊れた時用）
 */
export async function rebuildIndex() {
  const all = await keys();
  /** @type {IndexEntry[]} */
  const idx = [];
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue;
    const koutei = /** @type {import('./types.js').Koutei} */ (await get(k));
    if (!koutei) continue;
    const names = koutei.工事ブロック.map(b => b.工事名 || b.工事番号).filter(n => n);
    idx.push({
      id: koutei.id,
      工事名表示: names.length === 0 ? '(無題)' : names.length === 1 ? names[0] : `${names[0]} 他${names.length - 1}件`,
      月: koutei.meta.対象期間.開始.slice(0, 7),
      終了月: koutei.meta.対象期間.終了.slice(0, 7),
      期間表示: `${koutei.meta.対象期間.開始} - ${koutei.meta.対象期間.終了.slice(5)}`,
      提出種別: koutei.meta.提出種別,
      最終更新: koutei.meta.最終更新
    });
  }
  await set('index', idx);
  return idx.length;
}

// ───────────────────────── 設定 ─────────────────────────

const REQUIRED_KAISO = ['10tセルフ', '20tセルフ', '特車'];

/** @returns {Promise<import('./types.js').設定>} */
export async function loadSettings() {
  let s = await get('settings');
  if (!s) {
    s = defaultSettings();
    await set('settings', s);
    return s;
  }
  // 全フィールドの有無を検査し、欠けていればデフォルトで補う
  let mutated = false;
  const def = defaultSettings();
  for (const key of /** @type {(keyof typeof def)[]} */ (Object.keys(def))) {
    if (s[key] === undefined) {
      s[key] = def[key];
      mutated = true;
    }
  }
  // 旧バージョン互換：配列であるべきフィールドの保証
  if (!Array.isArray(s.回送プリセット)) { s.回送プリセット = []; mutated = true; }
  if (!Array.isArray(s.車両プリセット)) { s.車両プリセット = []; mutated = true; }
  if (!Array.isArray(s.重機プリセット)) { s.重機プリセット = []; mutated = true; }
  if (!Array.isArray(s.工種辞書))      { s.工種辞書      = [...KOUSHU_DEFAULT]; mutated = true; }
  if (!Array.isArray(s.宛先プリセット)) { s.宛先プリセット = []; mutated = true; }
  // 旧設定で 車両プリセット に入っていた回送系を 回送プリセット に移動
  const moved = s.車両プリセット.filter(v => REQUIRED_KAISO.includes(v));
  if (moved.length) {
    for (const v of moved) {
      if (!s.回送プリセット.includes(v)) s.回送プリセット.push(v);
    }
    s.車両プリセット = s.車両プリセット.filter(v => !REQUIRED_KAISO.includes(v));
    mutated = true;
  }
  // 必須回送プリセットの追補
  for (const v of REQUIRED_KAISO) {
    if (!s.回送プリセット.includes(v)) {
      s.回送プリセット.push(v);
      mutated = true;
    }
  }
  if (mutated) await set('settings', s);
  return s;
}

/** @param {import('./types.js').設定} settings */
export async function saveSettings(settings) {
  await set('settings', JSON.parse(JSON.stringify(settings)));
}

/** @returns {import('./types.js').設定} */
function defaultSettings() {
  return {
    PAT暗号化: null,
    宛先プリセット: [],
    工種辞書: [...KOUSHU_DEFAULT],
    重機プリセット: ['0.7BH', '0.45BH', '0.25BH','0.15BH', 'ラフター25t', 'ラフター50t'],
    車両プリセット: ['10tD','4tD','3tD', '2tD', '4tユニック'],
    回送プリセット: ['10tセルフ', '20tセルフ', '特車'],
    件名テンプレ: '[工程表] {工事番号} {期間}',
    自分のリポ: null
  };
}
