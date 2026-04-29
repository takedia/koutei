// アクセスログ用 beacon
// ntfy.sh に POST して、購読中の管理者端末（ntfy アプリ）にプッシュ通知が届く。
// 送信失敗してもアプリの動作には影響しない（fire-and-forget）。
//
// 「この端末は管理者」とマークされていれば通知はスキップ（自分の操作で通知が来ないように）

const NTFY_TOPIC = 'koutei-takedia-2026r7q9';
const NTFY_URL = 'https://ntfy.sh/';
const ADMIN_DEVICE_KEY = 'koutei-is-admin-device';

/** この端末は管理者扱いか（通知抑制） */
export function isAdminDevice() {
  try { return localStorage.getItem(ADMIN_DEVICE_KEY) === '1'; }
  catch { return false; }
}

/** 管理者端末としてマーク（admin-unlock 成功時に自動で呼ぶ） */
export function markAsAdminDevice() {
  try { localStorage.setItem(ADMIN_DEVICE_KEY, '1'); } catch {}
}

/** 管理者扱いを解除（設定から手動で） */
export function unmarkAsAdminDevice() {
  try { localStorage.removeItem(ADMIN_DEVICE_KEY); } catch {}
}

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
  // 管理者端末からは一切送らない
  if (isAdminDevice()) return;
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
