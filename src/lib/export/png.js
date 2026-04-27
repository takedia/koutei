// PNG 出力（html2canvas を使ってDOM要素を画像化）

/**
 * 指定要素を PNG Blob に変換
 * @param {HTMLElement} targetEl
 * @param {{scale?: number}} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportElementAsPng(targetEl, opts = {}) {
  const html2canvas = (await import('html2canvas')).default;

  // フォント読み込み完了を待つ
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }

  // モバイルは描画負荷が大きいので解像度控えめ（フリーズ対策）
  const isMobile = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const scale = opts.scale ?? (isMobile ? 1 : 1.5);

  const canvas = await html2canvas(targetEl, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    width: targetEl.scrollWidth,
    height: targetEl.scrollHeight,
    windowWidth: targetEl.scrollWidth,
    windowHeight: targetEl.scrollHeight
  });

  // canvas.toBlob はタイムアウトを付けて確実に完了/失敗させる
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PNG生成タイムアウト')), 30000);
    canvas.toBlob(blob => {
      clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('PNG生成に失敗しました'));
    }, 'image/png');
  });
}
