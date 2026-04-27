// バー操作ユーティリティ
import dayjs from 'dayjs';
import { calcBarHours } from '../types.js';

/**
 * 2点の日付からバーの開始・終了を決定（順不同で min/max を返す）
 * @param {string} a YYYY-MM-DD
 * @param {string} b YYYY-MM-DD
 * @returns {{開始: string, 終了: string}}
 */
export function makeRange(a, b) {
  return dayjs(a).isAfter(dayjs(b))
    ? { 開始: b, 終了: a }
    : { 開始: a, 終了: b };
}

/**
 * バンド内の合計時間
 * @param {import('../types.js').Band} band
 */
export function bandTotalHours(band) {
  return band.バー.reduce((s, b) => s + calcBarHours(b), 0);
}

/**
 * 工事ブロック内の合計時間
 * @param {import('../types.js').KojiBlock} block
 */
export function blockTotalHours(block) {
  return block.バンド.reduce((s, bd) => s + bandTotalHours(bd), 0);
}

/**
 * 新しいバーオブジェクト
 * @param {string} ラベル
 * @param {string} 開始
 * @param {string} 終了
 * @returns {import('../types.js').Bar}
 */
export function createBar(ラベル, 開始, 終了) {
  return {
    ラベル,
    サブラベル: '',
    開始,
    終了,
    休工: false,
    日別: {}
  };
}
