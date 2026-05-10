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

/** ファイル名からの拡張子推定（.xlsx / .pdf / .png / .json 等） */
function extFromFilename(/** @type {string} */ filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Blob 先頭バイトを読んで形式マジックを検証する。
 * 既知形式のみチェック、未知の拡張子は true を返す。
 * @param {Blob} blob
 * @param {string} ext  拡張子（lowercase, 先頭ドットなし）
 * @returns {Promise<boolean>}
 */
async function verifyBlobFormat(blob, ext) {
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
 * 戻り値の status:
 *   - 'downloaded': &lt;a download&gt; をトリガ済み（OS 側保存は確認できないが API は呼んだ）
 *   - 'shared'    : Web Share API が成功（ユーザーが共有先を選択）
 *   - 'opened'    : 新タブで blob を開いた（ユーザーが手動保存する必要あり）
 *   - 'cancelled' : ユーザーが共有シートをキャンセル
 *
 * 形式不一致や 0 byte の場合は Error を throw する。
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<{status:'downloaded'|'shared'|'opened'|'cancelled', size:number, ext:string}>}
 */
export async function downloadBlob(blob, filename) {
  const ext = extFromFilename(filename);
  const ok = await verifyBlobFormat(blob, ext);
  if (!ok) {
    throw new Error(`生成ファイルの形式が不正です（${ext || '不明'} / ${blob?.size ?? 0} byte）`);
  }
  const size = blob.size;

  if (isIos()) {
    // xlsx 等: Web Share だとテキスト化、xlsx MIME のままだと Safari が
    // 「開こうとして」失敗する。application/octet-stream に再ラップした上で
    // <a download> を同期的に click する。
    if (isProblematicForIosShare(blob)) {
      const dlBlob = new Blob([blob], { type: 'application/octet-stream' });
      triggerAnchorDownload(dlBlob, filename);
      return { status: 'downloaded', size, ext };
    }
    // PDF/PNG: Web Share API（共有シート → ファイルに保存 等）
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
