// 共有宛先プリセット（data/recipients.json から実行時取得）
// auth.json と同じく、GitHub の編集が CDN 経由で全端末に反映される

const RECIPIENTS_URL = 'https://raw.githubusercontent.com/takedia/koutei/main/data/recipients.json';

/**
 * @typedef {{ラベル: string, メアド: string}} Recipient
 */

/**
 * @returns {Promise<Recipient[]>}
 */
export async function fetchSharedRecipients() {
  try {
    const res = await fetch(`${RECIPIENTS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.presets)) return [];
    return data.presets.filter(p =>
      p && typeof p.ラベル === 'string' && typeof p.メアド === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * 設定 UI から共有宛先を編集した結果を、貼り付け用の JSON 文字列に整形
 * @param {Recipient[]} presets
 * @returns {string}
 */
export function formatRecipientsJson(presets) {
  return JSON.stringify({
    _comment: 'メール送信時の共有宛先プリセット。GitHub で編集すると CDN 5 分以内に全端末・全ユーザーに反映される。形式: presets[].ラベル, presets[].メアド',
    presets
  }, null, 2) + '\n';
}
