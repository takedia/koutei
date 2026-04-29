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
 * 全プラットフォーム共通で <a download> + blob URL を使う。
 * - iOS Safari の Web Share API は「ファイルに保存」した時に
 *   実バイナリではなくファイル名だけのテキストファイルが残る
 *   挙動があるため、Web Share は使わない。
 * - iOS 14.5+ は <a download> でも blob URL を実バイナリとして
 *   保存できるので、共通パスで動く想定。
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // iOS Safari は遅延クリーンアップが必要
  setTimeout(() => URL.revokeObjectURL(url), isIos() ? 60_000 : 0);
}
