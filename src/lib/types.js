// データモデル v1.2
// - DayCell の各項目を {値, 区分} の配列に変更（人員/重機/車両/その他は複数行入力可、回送は1行のみ）
// - KojiBlock.固定行数 で行数を保持
// - バンド .備考 は band の右端列に表示

import dayjs from 'dayjs';
import { uuid } from './utils/uuid.js';

/** @typedef {'自社'|'リース'} 重機等区分 */
/** @typedef {'自社'|'外注'}  人員区分 */

/**
 * @typedef {{値: string, 区分: '自社'|'リース'|'外注'}} CellEntry
 */

/**
 * @typedef {Object} DayCell
 * @property {CellEntry[]} 人員
 * @property {CellEntry[]} 重機
 * @property {CellEntry[]} 回送      // 常に length=1
 * @property {CellEntry[]} 車両
 * @property {CellEntry[]} その他
 */

/**
 * @typedef {Object} Bar
 * @property {string} ラベル
 * @property {string} サブラベル
 * @property {string} 開始
 * @property {string} 終了
 * @property {'AM'|'全日'} 始点位置
 * @property {'PM'|'全日'} 終点位置
 * @property {boolean} 休工
 */

/**
 * @typedef {Object} Band
 * @property {string} ラベル
 * @property {string} 備考
 * @property {Bar[]} バー
 */

/**
 * @typedef {Object} 固定行数
 * @property {number} 人員
 * @property {number} 重機
 * @property {number} 回送   // 1固定
 * @property {number} 車両
 * @property {number} その他
 */

/**
 * @typedef {Object} KojiBlock
 * @property {string} 工事名
 * @property {string} 工事番号
 * @property {string} 職長名
 * @property {Band[]} バンド
 * @property {固定行数} 固定行数
 * @property {Record<string, DayCell>} 日次セル
 */

/**
 * @typedef {Object} KouteiMeta
 * @property {string} 発注者
 * @property {string} 作成日
 * @property {{開始: string, 終了: string}} 対象期間
 * @property {'2週'|'月間'} 提出種別
 * @property {string} 最終更新
 * @property {number} 版数
 */

/**
 * @typedef {Object} Koutei
 * @property {string} id
 * @property {KouteiMeta} meta
 * @property {KojiBlock[]} 工事ブロック
 */

// ───────────────── ファクトリ ─────────────────

/** @returns {CellEntry} */
function emptyEntry() { return { 値: '', 区分: '自社' }; }

/**
 * @param {固定行数} kosu
 * @returns {DayCell}
 */
export function emptyDayCell(kosu) {
  return {
    人員:   Array.from({length: kosu.人員},   () => emptyEntry()),
    重機:   Array.from({length: kosu.重機},   () => emptyEntry()),
    回送:   [emptyEntry()],
    車両:   Array.from({length: kosu.車両},   () => emptyEntry()),
    その他: Array.from({length: kosu.その他}, () => emptyEntry())
  };
}

/** @returns {固定行数} */
function defaultKosu() {
  return { 人員: 1, 重機: 1, 回送: 1, 車両: 1, その他: 1 };
}

/**
 * @param {{提出種別?: '2週'|'月間', 開始日?: string}} opts
 * @returns {Koutei}
 */
export function createKoutei(opts = {}) {
  const today = dayjs();
  const 提出種別 = opts.提出種別 ?? '2週';
  const 開始 = opts.開始日 ?? today.format('YYYY-MM-DD');
  const days = 提出種別 === '2週' ? 14 : dayjs(開始).daysInMonth();
  const 終了 = dayjs(開始).add(days - 1, 'day').format('YYYY-MM-DD');
  return {
    id: uuid(),
    meta: {
      発注者: '',
      作成日: today.format('YYYY-MM-DD'),
      対象期間: { 開始, 終了 },
      提出種別,
      最終更新: today.toISOString(),
      版数: 1
    },
    工事ブロック: [createKojiBlock(開始, 終了)]
  };
}

/**
 * @param {string} 開始
 * @param {string} 終了
 * @returns {KojiBlock}
 */
export function createKojiBlock(開始, 終了) {
  const kosu = defaultKosu();
  return {
    工事名: '',
    工事番号: '',
    職長名: '',
    バンド: [
      { ラベル: '作業1', 備考: '', バー: [] },
      { ラベル: '作業2', 備考: '', バー: [] }
    ],
    固定行数: kosu,
    日次セル: createEmptyDayCells(開始, 終了, kosu)
  };
}

/**
 * @param {string} 開始
 * @param {string} 終了
 * @param {固定行数} kosu
 * @returns {Record<string, DayCell>}
 */
export function createEmptyDayCells(開始, 終了, kosu) {
  /** @type {Record<string, DayCell>} */
  const cells = {};
  let cur = dayjs(開始);
  const end = dayjs(終了);
  while (cur.isBefore(end) || cur.isSame(end)) {
    cells[cur.format('YYYY-MM-DD')] = emptyDayCell(kosu);
    cur = cur.add(1, 'day');
  }
  return cells;
}

/**
 * 期間変更時に既存セルをコピーしつつ新期間で再構築
 * @param {string} 開始
 * @param {string} 終了
 * @param {固定行数} kosu
 * @param {Record<string, DayCell>} existing
 */
export function rebuildDayCells(開始, 終了, kosu, existing) {
  const fresh = createEmptyDayCells(開始, 終了, kosu);
  for (const d of Object.keys(fresh)) {
    if (existing[d]) {
      // 既存配列を新行数に合わせて伸縮
      for (const key of /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他'])) {
        const target = key === '回送' ? 1 : kosu[key];
        const arr = (existing[d][key] ?? []).slice(0, target);
        while (arr.length < target) arr.push(emptyEntry());
        fresh[d][key] = arr;
      }
    }
  }
  return fresh;
}

// ───────────────── マイグレーション ─────────────────

/**
 * 旧形式（v1.0/v1.1）の Koutei を v1.2 に変換
 * @param {any} k
 * @returns {Koutei}
 */
export function migrateKoutei(k) {
  if (!k || !k.工事ブロック) return k;
  for (const block of k.工事ブロック) {
    if (block.職長名 == null) block.職長名 = '';
    delete block.備考;

    // バンド整形
    for (let i = 0; i < block.バンド.length; i++) {
      const b = block.バンド[i];
      if (b.ラベル == null) b.ラベル = `作業${i + 1}`;
      if (b.備考 == null) b.備考 = '';
      for (const bar of b.バー ?? []) {
        if (bar.休工 == null) bar.休工 = false;
        if (bar.始点位置 == null) bar.始点位置 = '全日';
        if (bar.終点位置 == null) bar.終点位置 = '全日';
        if (bar.サブラベル == null) bar.サブラベル = '';
        delete bar.雨天;
      }
    }

    // 固定行数
    if (!block.固定行数) block.固定行数 = defaultKosu();

    // 日次セル: string→Array に変換
    for (const date of Object.keys(block.日次セル ?? {})) {
      const c = block.日次セル[date];
      if (!c) { block.日次セル[date] = emptyDayCell(block.固定行数); continue; }

      for (const key of /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他'])) {
        const v = c[key];
        if (Array.isArray(v)) continue;
        // 旧文字列形式 → 1要素配列
        const 区分 = c[`${key}区分`] ?? '自社';
        c[key] = (v ?? '') === '' && 区分 === '自社'
          ? [{ 値: '', 区分: '自社' }]
          : [{ 値: v ?? '', 区分 }];
        delete c[`${key}区分`];
      }

      // 配列長を 固定行数 に合わせる
      for (const key of /** @type {const} */ (['人員', '重機', '車両', 'その他'])) {
        const target = block.固定行数[key];
        const arr = c[key];
        while (arr.length < target) arr.push({ 値: '', 区分: '自社' });
      }
      // 回送 は1固定
      if (c.回送.length === 0) c.回送 = [{ 値: '', 区分: '自社' }];
      else c.回送 = c.回送.slice(0, 1);
    }
  }
  return k;
}

// ───────────────── 計算 ─────────────────

/**
 * @param {Bar} bar
 * @returns {number}
 */
export function calcBarHours(bar) {
  if (bar.休工) return 0;
  const start = dayjs(bar.開始);
  const end = dayjs(bar.終了);
  const totalDays = end.diff(start, 'day') + 1;
  let hours = totalDays * 8;
  if (bar.始点位置 === 'AM') hours -= 4;
  if (bar.終点位置 === 'PM') hours -= 4;
  return Math.max(0, hours);
}
