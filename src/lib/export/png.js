// PNG 出力（html-to-image を使ってDOM要素を画像化）
// html2canvas より iOS Safari + CSS Grid 互換性が良い

/**
 * 指定要素を PNG Blob に変換
 * @param {HTMLElement} targetEl
 * @param {{scale?: number}} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportElementAsPng(targetEl, opts = {}) {
  const { toBlob } = await import('html-to-image');

  // フォント読み込み完了を待つ
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }
  // レイアウトが完全に確定するように 1 フレーム待つ
  await new Promise(r => requestAnimationFrame(r));

  const isMobile = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const pixelRatio = opts.scale ?? (isMobile ? 1.5 : 2);

  const blob = await toBlob(targetEl, {
    backgroundColor: '#ffffff',
    pixelRatio,
    width: targetEl.scrollWidth,
    height: targetEl.scrollHeight,
    cacheBust: true,
    skipFonts: false
  });
  if (!blob) throw new Error('PNG生成に失敗しました');
  return blob;
}
