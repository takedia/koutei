// アクセスログ用 beacon
// ntfy.sh に POST して、購読中の管理者端末（ntfy アプリ）にプッシュ通知が届く。
// 送信失敗してもアプリの動作には影響しない（fire-and-forget）。

const NTFY_TOPIC = 'koutei-takedia-2026r7q9';
const NTFY_URL = 'https://ntfy.sh/';

/**
 * セッション内で同じ kind を 1 回しか送らないためのフラグ
 * （リロード/再認証で何度も通知が来ないように）
 * @type {Set<string>}
 */
const sentInSession = new Set();

/**
 * @param {'user-login' | 'admin-unlock' | 'no-password-open'} kind
 * @param {string} [note] 任意のメモ
 */
export async function notifyAccess(kind, note) {
  if (sentInSession.has(kind)) return;
  sentInSession.add(kind);

  const title =
    kind === 'admin-unlock'    ? '🔑 管理者解錠' :
    kind === 'no-password-open'? '🚪 ノーパス入室' :
                                 '👤 ユーザーログイン';

  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const body = JSON.stringify({
    topic: NTFY_TOPIC,
    title,
    message: `${ts}\nUA: ${ua}${note ? '\n' + note : ''}`,
    priority: kind === 'admin-unlock' ? 2 : 3,
    tags: [kind]
  });

  try {
    // keepalive で、画面遷移直後でも送信が完走するようにする
    await fetch(NTFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
  } catch {
    // 失敗しても無視（ログ用なので）
  }
}
