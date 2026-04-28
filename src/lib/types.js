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
 * @typedef {'全日'|'AM'|'PM'} 日状態
 */

/**
 * @typedef {Object} Bar
 * @property {string} ラベル
 * @property {string} サブラベル
 * @property {string} 開始
 * @property {string} 終了
 * @property {boolean} 休工
 * @property {Record<string, 日状態>} 日別  // 1マスずつの状態（未指定=全日）
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
 * @property {number} 回送
 * @property {number} 車両
 * @property {number} その他
 */

/**
 * @typedef {Object} 固定行ラベル
 * @property {string[]} 人員
 * @property {string[]} 重機
 * @property {string[]} 回送
 * @property {string[]} 車両
 * @property {string[]} その他
 */

/**
 * @typedef {Object} KojiBlock
 * @property {string} 工事名
 * @property {string} 工事番号
 * @property {string} 職長名
 * @property {Band[]} バンド
 * @property {固定行数} 固定行数
 * @property {固定行ラベル} 固定行ラベル
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
  return { 人員: 2, 重機: 1, 回送: 1, 車両: 1, その他: 1 };
}

/** @returns {固定行ラベル} */
function defaultLabels() {
  return {
    人員:   ['自社', '外注'],
    重機:   ['自社'],
    回送:   ['自社'],
    車両:   ['自社'],
    その他: ['自社']
  };
}

/**
 * @param {{提出種別?: '2週'|'月間', 開始日?: string}} opts
 * @returns {Koutei}
 */
export function createKoutei(opts = {}) {
  const today = dayjs();
  const 提出種別 = opts.提出種別 ?? '2週';
  // 2週は必ず月曜始まり、月間は必ず月初始まり
  const baseStart = opts.開始日 ?? today.format('YYYY-MM-DD');
  let 開始;
  if (提出種別 === '2週') {
    開始 = alignToMonday(baseStart);
  } else {
    開始 = dayjs(baseStart).startOf('month').format('YYYY-MM-DD');
  }
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
 * 与えられた日付を「その週の月曜日」に揃える（dayjs の day(): 日=0, 月=1, …, 土=6）
 * @param {string} ymd YYYY-MM-DD
 * @returns {string}
 */
export function alignToMonday(ymd) {
  const d = dayjs(ymd);
  const dow = d.day();             // 日=0, 月=1, …, 土=6
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  return d.add(offsetToMonday, 'day').format('YYYY-MM-DD');
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
    固定行ラベル: defaultLabels(),
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
 * 期間変更時に既存セルを保持しつつ新期間分のセルを補完。
 * 範囲外の既存データも残す（月送りで前月データを失わないため）。
 * @param {string} 開始
 * @param {string} 終了
 * @param {固定行数} kosu
 * @param {Record<string, DayCell>} existing
 */
export function rebuildDayCells(開始, 終了, kosu, existing) {
  /** @type {Record<string, DayCell>} */
  const out = { ...existing };
  // 新範囲の各日付について、未存在なら空セルを追加、存在するなら固定行数に合わせて伸縮
  let cur = dayjs(開始);
  const end = dayjs(終了);
  while (cur.isBefore(end) || cur.isSame(end)) {
    const d = cur.format('YYYY-MM-DD');
    if (!out[d]) {
      out[d] = emptyDayCell(kosu);
    } else {
      for (const key of /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他'])) {
        const target = key === '回送' ? 1 : kosu[key];
        const arr = (out[d][key] ?? []).slice(0, target);
        while (arr.length < target) arr.push(emptyEntry());
        out[d][key] = arr;
      }
    }
    cur = cur.add(1, 'day');
  }
  return out;
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
        if (bar.サブラベル == null) bar.サブラベル = '';
        delete bar.雨天;
        // 旧形式 始点位置/終点位置 → 日別
        if (!bar.日別) bar.日別 = {};
        if (bar.始点位置 === 'AM' && bar.開始) {
          bar.日別[bar.開始] = bar.日別[bar.開始] ?? 'AM';
        }
        if (bar.終点位置 === 'PM' && bar.終了) {
          bar.日別[bar.終了] = bar.日別[bar.終了] ?? 'PM';
        }
        delete bar.始点位置;
        delete bar.終点位置;
      }
    }

    // 固定行数
    if (!block.固定行数) block.固定行数 = defaultKosu();
    // 固定行ラベル（既存データには無いので追補）
    if (!block.固定行ラベル) block.固定行ラベル = defaultLabels();
    // ラベル長を 固定行数 に合わせる
    for (const k of /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他'])) {
      const target = block.固定行数[k];
      const arr = block.固定行ラベル[k] ?? [];
      const defaults = defaultLabels()[k];
      while (arr.length < target) {
        // 自社→外注/リース→...の順で足す
        if (k === '人員') arr.push(arr.length === 0 ? '自社' : (arr.length === 1 ? '外注' : `外注${arr.length}`));
        else arr.push(arr.length === 0 ? '自社' : (arr.length === 1 ? 'リース' : `リース${arr.length}`));
      }
      block.固定行ラベル[k] = arr.slice(0, target);
    }

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
  let cur = dayjs(bar.開始);
  const end = dayjs(bar.終了);
  let hours = 0;
  while (cur.isBefore(end) || cur.isSame(end)) {
    const d = cur.format('YYYY-MM-DD');
    const s = bar.日別?.[d] ?? '全日';
    hours += s === '全日' ? 8 : 4;
    cur = cur.add(1, 'day');
  }
  return hours;
}
