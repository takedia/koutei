// PDF 出力（html-to-image → jsPDF で A4 横サイズに収める）
// html2canvas より iOS Safari + CSS Grid 互換性が良い

/**
 * Blob を Image 要素に読み込み、Canvas に描画して返す
 * @param {Blob} blob
 * @returns {Promise<HTMLCanvasElement>}
 */
async function blobToCanvas(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('画像読み込み失敗'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context が取得できません');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * canvas → PDF Blob（A4 横、画像を1ページに収める）
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
async function canvasToPdfBlob(canvas) {
  const { jsPDF } = await import('jspdf');
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const margin = 5;
  const availW = pdfW - margin * 2;
  const availH = pdfH - margin * 2;
  const imgRatio = canvas.width / canvas.height;
  const availRatio = availW / availH;
  let w, h;
  if (imgRatio > availRatio) {
    w = availW;
    h = w / imgRatio;
  } else {
    h = availH;
    w = h * imgRatio;
  }
  const x = (pdfW - w) / 2;
  const y = (pdfH - h) / 2;
  pdf.addImage(imgData, 'JPEG', x, y, w, h);
  return pdf.output('blob');
}

/**
 * PDF と、プレビュー用の PNG Blob をまとめて返す。
 * iframe PDF プレビューが動かないモバイルでも画像プレビューで代用するため。
 * @param {HTMLElement} targetEl
 * @returns {Promise<{pdfBlob: Blob, previewBlob: Blob}>}
 */
export async function exportElementAsPdfWithPreview(targetEl) {
  const { toBlob } = await import('html-to-image');

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }
  await new Promise(r => requestAnimationFrame(r));

  const isMobile = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const pixelRatio = isMobile ? 1.5 : 2;

  const previewBlob = await toBlob(targetEl, {
    backgroundColor: '#ffffff',
    pixelRatio,
    width: targetEl.scrollWidth,
    height: targetEl.scrollHeight,
    cacheBust: true,
    skipFonts: false
  });
  if (!previewBlob) throw new Error('プレビュー画像生成に失敗しました');

  const canvas = await blobToCanvas(previewBlob);
  const pdfBlob = await canvasToPdfBlob(canvas);
  return { pdfBlob, previewBlob };
}
