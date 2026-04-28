// PDF 出力（html2canvas → jsPDF で A4 横サイズに収める）

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
 * 指定要素を PDF Blob に変換（A4 横）
 * @param {HTMLElement} targetEl
 * @returns {Promise<Blob>}
 */
export async function exportElementAsPdf(targetEl) {
  const html2canvas = (await import('html2canvas')).default;

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }

  const isMobile = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const scale = isMobile ? 1 : 1.5;

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

  return canvasToPdfBlob(canvas);
}

/**
 * PDF と、プレビュー用の PNG Blob をまとめて返す。
 * iframe PDF プレビューが動かないモバイルでも画像プレビューで代用するため。
 * @param {HTMLElement} targetEl
 * @returns {Promise<{pdfBlob: Blob, previewBlob: Blob}>}
 */
export async function exportElementAsPdfWithPreview(targetEl) {
  const html2canvas = (await import('html2canvas')).default;

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }

  const isMobile = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const scale = isMobile ? 1 : 1.5;

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

  // プレビュー用 PNG（軽量化のため jpeg 品質 0.85）
  const previewBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('プレビュー画像生成失敗')), 'image/jpeg', 0.85);
  });
  const pdfBlob = await canvasToPdfBlob(canvas);
  return { pdfBlob, previewBlob };
}
