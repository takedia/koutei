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

  const scale = opts.scale ?? 2;

  const canvas = await html2canvas(targetEl, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    // 横スクロールも含めて全体を描画
    width: targetEl.scrollWidth,
    height: targetEl.scrollHeight,
    windowWidth: targetEl.scrollWidth,
    windowHeight: targetEl.scrollHeight
  });

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('PNG生成に失敗しました'));
    }, 'image/png');
  });
}
