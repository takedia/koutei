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
 * Blob をダウンロード。
 *
 * - iOS Safari: blob URL を新タブで開く。
 *   PDF はインライン表示 → Safari の共有ボタンで「ファイルに保存」、
 *   xlsx 等はダウンロードプロンプト or 「Numbers で開く」が出る。
 *   <a download> + click() は iOS 17/18 で無反応になることがあるので使わない。
 * - PC / Android: 従来通り <a download> + blob URL で自動ダウンロード。
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  if (isIos()) {
    // iOS は新タブで blob を開いて Safari に処理させる
    const win = window.open(url, '_blank');
    if (!win) {
      // ポップアップブロック等で開けなかった時は同タブ遷移
      location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  // PC / Android
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
