// PDF 出力（html2canvas → jsPDF で A4 横サイズに収める）

/**
 * 指定要素を PDF Blob に変換（A4 横）
 * @param {HTMLElement} targetEl
 * @returns {Promise<Blob>}
 */
export async function exportElementAsPdf(targetEl) {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

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

  // jpeg にして PDF サイズも軽減
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
