// データモデル定義
// バンド = 横一列の作業行（写真様式）。デフォルト「作業1」「作業2」…で編集可（例：「土工」など大分類）。
// 日次セルの各項目には 区分（自社/リース/外注）を持たせ、表示時に色分け。

import dayjs from 'dayjs';
import { uuid } from './utils/uuid.js';

/**
 * @typedef {'自社'|'リース'} 重機等区分
 * @typedef {'自社'|'外注'}  人員区分
 */

/**
 * @typedef {Object} Koutei
 * @property {string} id
 * @property {KouteiMeta} meta
 * @property {KojiBlock[]} 工事ブロック   // 当面 length=1 固定
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
 * @typedef {Object} KojiBlock
 * @property {string} 工事名
 * @property {string} 工事番号
 * @property {string} 職長名
 * @property {Band[]} バンド
 * @property {Record<string, DayCell>} 日次セル
 */

/**
 * @typedef {Object} Band
 * @property {string} ラベル          // "作業1" / "土工" 等、編集可
 * @property {string} 備考            // 行ごとの補足
 * @property {Bar[]} バー
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
 * @typedef {Object} DayCell
 * @property {string} 人員
 * @property {人員区分} 人員区分
 * @property {string} 重機
 * @property {重機等区分} 重機区分
 * @property {string} 回送
 * @property {重機等区分} 回送区分
 * @property {string} 車両
 * @property {重機等区分} 車両区分
 * @property {string} その他
 * @property {重機等区分} その他区分
 */

/** @returns {DayCell} */
function emptyDayCell() {
  return {
    人員: '', 人員区分: '自社',
    重機: '', 重機区分: '自社',
    回送: '', 回送区分: '自社',
    車両: '', 車両区分: '自社',
    その他: '', その他区分: '自社'
  };
}

// ───────────────── ファクトリ ─────────────────

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
  return {
    工事名: '',
    工事番号: '',
    職長名: '',
    バンド: [
      { ラベル: '作業1', 備考: '', バー: [] },
      { ラベル: '作業2', 備考: '', バー: [] }
    ],
    日次セル: createEmptyDayCells(開始, 終了)
  };
}

/**
 * @param {string} 開始
 * @param {string} 終了
 * @returns {Record<string, DayCell>}
 */
export function createEmptyDayCells(開始, 終了) {
  /** @type {Record<string, DayCell>} */
  const cells = {};
  let cur = dayjs(開始);
  const end = dayjs(終了);
  while (cur.isBefore(end) || cur.isSame(end)) {
    cells[cur.format('YYYY-MM-DD')] = emptyDayCell();
    cur = cur.add(1, 'day');
  }
  return cells;
}

/**
 * 旧バージョンで保存されたデータを最新形に整形（破壊的）
 * @param {any} k
 * @returns {Koutei}
 */
export function migrateKoutei(k) {
  if (!k || !k.工事ブロック) return k;
  for (const block of k.工事ブロック) {
    if (block.職長名 == null) block.職長名 = '';
    for (let i = 0; i < block.バンド.length; i++) {
      const b = block.バンド[i];
      if (b.ラベル == null) b.ラベル = `作業${i + 1}`;
      if (b.備考 == null) b.備考 = '';
      for (const bar of b.バー ?? []) {
        if (bar.休工 == null) bar.休工 = false;
        delete bar.雨天;       // 仕様変更で削除
      }
    }
    for (const date of Object.keys(block.日次セル ?? {})) {
      const c = block.日次セル[date];
      if (!c) { block.日次セル[date] = emptyDayCell(); continue; }
      if (c.人員区分 == null) c.人員区分 = '自社';
      if (c.重機区分 == null) c.重機区分 = '自社';
      if (c.回送区分 == null) c.回送区分 = '自社';
      if (c.車両区分 == null) c.車両区分 = '自社';
      if (c.その他区分 == null) c.その他区分 = '自社';
    }
    delete block.備考;          // 旧フィールド除去
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
