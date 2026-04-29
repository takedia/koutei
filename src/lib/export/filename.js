// 出力ファイル名生成
import dayjs from 'dayjs';

/**
 * @param {import('../types.js').Koutei} koutei
 * @param {'xlsx'|'pdf'|'png'} ext
 */
export function makeFilename(koutei, ext) {
  const block = koutei.工事ブロック[0];
  const num = (block?.工事番号 || 'no-koujiNo').replace(/[\\/:*?"<>|]/g, '_');
  const s = dayjs(koutei.meta.対象期間.開始).format('YYYYMMDD');
  const e = dayjs(koutei.meta.対象期間.終了).format('YYYYMMDD');
  return `koutei_${num}_${s}-${e}.${ext}`;
}

/** iOS Safari/Chrome 判定（iPadOS の Safari は Mac UA を返すので touch も見る） */
export function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  // iPadOS: UA は Mac だが maxTouchPoints > 1
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/** iOS Safari の Web Share API でうまく扱えない（受信側がテキストに化ける）形式 */
export function isProblematicForIosShare(/** @type {Blob} */ blob) {
  if (!isIos() || !blob) return false;
  const t = blob.type || '';
  // .xlsx (および類似 OOXML) は受信メーラがテキスト化することがあるので Web Share を回避
  if (t.includes('spreadsheetml') || t.includes('officedocument')) return true;
  return false;
}

/**
 * Service Worker 経由のダウンロード。
 * 仮想 URL を Cache に Response として登録して、SW が
 * Content-Disposition: attachment 付きで返すことで、
 * iOS Safari でも HTTP レスポンスとして処理されて確実に
 * バイナリのまま保存される。
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<boolean>} 成功した場合 true
 */
async function downloadViaServiceWorker(blob, filename) {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  const reg = await navigator.serviceWorker.ready;
  if (!reg || !navigator.serviceWorker.controller) return false;

  const id = (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2));
  const path = `__download/${id}/${encodeURIComponent(filename)}`;
  const fullUrl = new URL(path, location.href).href;

  const response = new Response(blob, {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': String(blob.size)
    }
  });

  const cache = await caches.open('koutei-downloads-v1');
  await cache.put(fullUrl, response);

  // ダウンロード起動: <a download> でも target="_blank" でもブラウザ次第。
  // iOS は同タブ遷移で確実にダウンロード扱いになる。
  const a = document.createElement('a');
  a.href = fullUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 一定時間後にキャッシュから削除
  setTimeout(() => { cache.delete(fullUrl).catch(() => {}); }, 60_000);
  return true;
}

/**
 * Blob をダウンロード。
 *
 * 1. Service Worker 経由（推奨。iOS Safari で blob URL が
 *    .txt 化する問題を完全回避）
 * 2. SW が使えない環境では従来の <a download> + blob URL
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadBlob(blob, filename) {
  try {
    const ok = await downloadViaServiceWorker(blob, filename);
    if (ok) return;
  } catch (e) {
    console.warn('SW download failed, fallback to blob URL', e);
  }
  // フォールバック: blob URL + <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), isIos() ? 60_000 : 0);
}
