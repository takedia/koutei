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
function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  // iPadOS: UA は Mac だが maxTouchPoints > 1
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/**
 * Blob をダウンロード（PC/Android は <a download>、iOS は共有シート or 新タブにフォールバック）
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadBlob(blob, filename) {
  if (isIos()) {
    // ① Web Share API（iOS 15+ Safari 対応）でファイル共有 → 「ファイルに保存」が選べる
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      const nav = /** @type {Navigator & {canShare?:(d:any)=>boolean, share?:(d:any)=>Promise<void>}} */ (navigator);
      if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      // ユーザーが共有シートをキャンセルした等。次のフォールバックへ。
      const name = /** @type {any} */ (e)?.name;
      if (name === 'AbortError') return;  // ユーザーキャンセルは黙ってリターン
      console.warn('share failed, fallback to new-tab', e);
    }
    // ② 新タブで Blob を開く → ユーザーが「共有→ファイルに保存」等で保存
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // ポップアップブロック時は同タブ遷移
      location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  // PC/Android: 従来通りの <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
