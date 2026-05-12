// 出力ファイル名生成
import dayjs from 'dayjs';

/**
 * @param {import('../types.js').Koutei} koutei
 * @param {'xlsx'|'pdf'|'png'|'json'} ext
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

/** ファイル名からの拡張子推定（.xlsx / .pdf / .png / .json 等） */
export function extFromFilename(/** @type {string} */ filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Blob 先頭バイトを読んで形式マジックを検証する。
 * 既知形式のみチェック、未知の拡張子は true を返す。
 * downloadBlob からは呼ばない（async が iOS の user gesture を切るため）。
 * 呼び出し側が「生成直後」に await して使うこと。
 * @param {Blob} blob
 * @param {string} ext  拡張子（lowercase, 先頭ドットなし）
 * @returns {Promise<boolean>}
 */
export async function verifyBlobFormat(blob, ext) {
  if (!blob || blob.size === 0) return false;
  let head;
  try {
    head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  } catch {
    return false;
  }
  switch (ext) {
    case 'xlsx': // ZIP (PK\x03\x04)
      return head[0] === 0x50 && head[1] === 0x4B;
    case 'pdf':  // %PDF
      return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    case 'png':  // \x89PNG
      return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
    case 'json':
    default:
      return true;
  }
}

/**
 * &lt;a download&gt; を一時生成して click() するヘルパ
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerAnchorDownload(blob, filename) {
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

/**
 * Blob をダウンロード。
 *
 * 重要: iOS Safari は async/await が間に挟まると user gesture が切れて
 * &lt;a download&gt; や window.open が無効化されるため、呼ばれた瞬間に
 * **同期的にトリガ** する設計にしている。
 *  - xlsx 等の anchor download パスは完全 sync
 *  - PDF/PNG の Web Share パスのみ navigator.share() の Promise を await する
 *    （share() の呼び出し自体が同期なので gesture は維持される）
 *
 * 形式マジックバイトの検証は呼び出し側で「生成直後」に行うこと（verifyBlobFormat）。
 *
 * 戻り値の status:
 *   - 'downloaded': &lt;a download&gt; をトリガ済み
 *   - 'shared'    : Web Share API が成功
 *   - 'opened'    : 新タブで blob を開いた（手動保存が必要）
 *   - 'cancelled' : ユーザーが共有シートをキャンセル
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<{status:'downloaded'|'shared'|'opened'|'cancelled', size:number, ext:string}>}
 */
export async function downloadBlob(blob, filename) {
  const ext = extFromFilename(filename);
  if (!blob || blob.size === 0) {
    throw new Error(`ファイルが空です（${ext || '不明'}）`);
  }
  const size = blob.size;

  if (isIos()) {
    // xlsx 等: 過去の試行で Web Share (xlsx MIME) → テキスト化、<a download> →
    // click 無反応、window.open → URL のみ保存 だった。今回は Web Share API で
    // ファイルを渡すが、MIME を application/octet-stream に偽装することで
    //   - iOS の「Excel として送る」変換を回避し
    //   - share() の Promise で本当に完了したか判定できる
    // ようにする。share() が使えない端末は anchor download にフォールバック。
    if (isProblematicForIosShare(blob)) {
      try {
        const file = new File([blob], filename, { type: 'application/octet-stream' });
        const nav = /** @type {Navigator & {canShare?:(d:any)=>boolean, share?:(d:any)=>Promise<void>}} */ (navigator);
        if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
          await nav.share({ files: [file], title: filename });
          return { status: 'shared', size, ext };
        }
      } catch (e) {
        const name = /** @type {any} */ (e)?.name;
        if (name === 'AbortError') return { status: 'cancelled', size, ext };
        console.warn('xlsx share failed, fallback to anchor', e);
      }
      // フォールバック: octet-stream 再ラップ + <a download>
      const dlBlob = new Blob([blob], { type: 'application/octet-stream' });
      triggerAnchorDownload(dlBlob, filename);
      return { status: 'downloaded', size, ext };
    }
    // PDF/PNG: Web Share API（共有シート → ファイルに保存 等）
    // navigator.share() の呼び出しは同期なので user gesture は維持される。
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      const nav = /** @type {Navigator & {canShare?:(d:any)=>boolean, share?:(d:any)=>Promise<void>}} */ (navigator);
      if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
        await nav.share({ files: [file], title: filename });
        return { status: 'shared', size, ext };
      }
    } catch (e) {
      const name = /** @type {any} */ (e)?.name;
      if (name === 'AbortError') return { status: 'cancelled', size, ext };
      console.warn('share failed, fallback to new-tab', e);
    }
    // フォールバック: 新タブで Blob を開く
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { status: 'opened', size, ext };
  }

  // PC/Android: <a download>
  triggerAnchorDownload(blob, filename);
  return { status: 'downloaded', size, ext };
}
