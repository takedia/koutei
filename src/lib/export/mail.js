// メール送信用の件名生成と mailto: URL 構築

import { formatRange } from '../utils/date.js';

/**
 * 件名テンプレ内の変数を実値で置換
 * 利用可能変数: {工事番号} {工事名} {期間} {発注者}
 * @param {string} template
 * @param {import('../types.js').Koutei} koutei
 * @returns {string}
 */
export function renderSubject(template, koutei) {
  const block = koutei.工事ブロック[0] ?? null;
  const vars = {
    '{工事番号}': block?.工事番号 || '',
    '{工事名}':   block?.工事名   || '',
    '{期間}':     formatRange(koutei.meta.対象期間.開始, koutei.meta.対象期間.終了),
    '{発注者}':   koutei.meta.発注者 || ''
  };
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(k).join(v);
  }
  return out.trim();
}

/**
 * mailto: URL を組み立てる（複数宛先カンマ区切り）
 * @param {string[]} recipients
 * @param {string} subject
 * @param {string} body
 * @returns {string}
 */
export function buildMailto(recipients, subject, body) {
  const to = recipients.filter(Boolean).join(',');
  const params = [];
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body) params.push('body=' + encodeURIComponent(body));
  return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
}

/**
 * 既定の本文（添付ファイル名と注記）
 * @param {string} filename
 * @returns {string}
 */
export function defaultBody(filename) {
  return [
    'お疲れ様です。',
    '',
    `工程表（${filename}）を添付しました。`,
    'ご確認をお願いいたします。',
    '',
    '※このメールには添付ファイルを別途手動で添付してください。'
  ].join('\n');
}
