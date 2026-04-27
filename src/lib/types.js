// データモデル定義（JSDoc型 + ファクトリ関数）
// IndexedDB および GitHub 保存時の JSON シリアライズはこの形に揃える

import dayjs from 'dayjs';
import { uuid } from './utils/uuid.js';

/**
 * @typedef {Object} Koutei
 * @property {string} id
 * @property {KouteiMeta} meta
 * @property {KojiBlock[]} 工事ブロック
 */

/**
 * @typedef {Object} KouteiMeta
 * @property {string} 発注者
 * @property {string} 作成日              // ISO date YYYY-MM-DD
 * @property {{開始: string, 終了: string}} 対象期間
 * @property {'2週'|'月間'} 提出種別
 * @property {string} 最終更新            // ISO datetime
 * @property {number} 版数
 */

/**
 * @typedef {Object} KojiBlock
 * @property {string} 工事名
 * @property {string} 工事番号
 * @property {Band[]} バンド
 * @property {string} 職長名
 * @property {Record<string, DayCell>} 日次セル   // key: YYYY-MM-DD
 * @property {string} 備考
 */

/**
 * @typedef {Object} Band
 * @property {Bar[]} バー
 */

/**
 * @typedef {Object} Bar
 * @property {string} ラベル              // 工種名（β上段）
 * @property {string} サブラベル          // 数量等（β下段）
 * @property {string} 開始                // YYYY-MM-DD
 * @property {string} 終了                // YYYY-MM-DD
 * @property {'AM'|'全日'} 始点位置
 * @property {'PM'|'全日'} 終点位置
 * @property {boolean} 雨天
 * @property {boolean} 休工
 */

/**
 * @typedef {Object} DayCell
 * @property {string} 人員
 * @property {string} 重機
 * @property {string} 回送
 * @property {string} 車両
 * @property {string} その他
 */

/**
 * @typedef {Object} 設定
 * @property {string|null} PAT暗号化
 * @property {AddressPreset[]} 宛先プリセット
 * @property {string[]} 工種辞書
 * @property {string[]} 人員プリセット
 * @property {string[]} 重機プリセット
 * @property {string[]} 車両プリセット
 * @property {string} 件名テンプレ
 * @property {{owner: string, repo: string, branch: string}|null} 自分のリポ
 */

/**
 * @typedef {Object} AddressPreset
 * @property {string} ラベル
 * @property {string} メアド
 */

// ───────────────────────── ファクトリ ─────────────────────────

/**
 * 新しい工程表を作成
 * @param {{提出種別?: '2週'|'月間', 開始日?: string}} opts
 * @returns {Koutei}
 */
export function createKoutei(opts = {}) {
  const today = dayjs();
  const 提出種別 = opts.提出種別 ?? '2週';
  const 開始 = opts.開始日 ?? today.format('YYYY-MM-DD');
  const days = 提出種別 === '2週' ? 14 : daysInMonth(開始);
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
 * 工事ブロックの初期値
 * @param {string} 開始
 * @param {string} 終了
 * @returns {KojiBlock}
 */
export function createKojiBlock(開始, 終了) {
  return {
    工事名: '',
    工事番号: '',
    バンド: [{ バー: [] }, { バー: [] }],   // デフォルト2バンド
    職長名: '',
    日次セル: createEmptyDayCells(開始, 終了),
    備考: ''
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
    cells[cur.format('YYYY-MM-DD')] = {
      人員: '', 重機: '', 回送: '', 車両: '', その他: ''
    };
    cur = cur.add(1, 'day');
  }
  return cells;
}

/**
 * 月の日数（YYYY-MM-DD の月の日数）
 * @param {string} dateStr
 */
function daysInMonth(dateStr) {
  return dayjs(dateStr).daysInMonth();
}

/**
 * バーの合計時間を計算（h）
 * @param {Bar} bar
 * @returns {number}
 */
export function calcBarHours(bar) {
  if (bar.休工) return 0;
  const start = dayjs(bar.開始);
  const end = dayjs(bar.終了);
  const totalDays = end.diff(start, 'day') + 1;
  let hours = totalDays * 8;
  if (bar.始点位置 === 'AM' && totalDays >= 1) hours -= 4;  // AM始まり=その日は4hのみ
  if (bar.終点位置 === 'PM' && totalDays >= 1) hours -= 4;  // PM終わり=その日は4hのみ
  // ※始点AMの定義: 始日のAMから開始 → 始日は4h勤務 ではなく「始日PMから開始」がAM以外。
  //   ここでは「AM=半日のみ(4h)、全日=8h」の解釈で計算。
  return Math.max(0, hours);
}
