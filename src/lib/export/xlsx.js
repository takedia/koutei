// xlsx 出力（ExcelJS 利用）
// 工程表らしいバー表示（黒い枠の長方形）でガントチャート風に出力
//
// レイアウト：
//   行1: タイトル（merged）
//   行2: メタ（発注者 / 工事番号 / 工事名 / 職長）
//   行3: 期間 / 提出種別
//   行4: 空き
//   行5: 日付ヘッダ（曜日+日、土日祝は淡黄塗り）
//   行6〜: バンド行（バーをセル結合・太枠で表示）
//   その下: 固定行（人員/重機/回送/車両/その他）

import { dateRange, dayOfWeekJa, dayOfMonth } from '../utils/date.js';
import { holidayOf } from '../data/holidays.js';
import { calcBarHours } from '../types.js';

const COLOR = {
  自社:     'FF1A1A1A',
  リース:   'FF1F6FEB',
  外注:     'FFDC2626',
  休日塗り: 'FFFFF7D6',
  ヘッダ背: 'FFEEF2F6',
  固定行背: 'FFFAFAFA',
  バー枠:   'FF111111',
  休工塗:   'FFE5E7EB'
};

const BORDER_THIN = (c = 'FFD1D5DB') => ({ style: 'thin', color: { argb: c } });
const BORDER_MED  = (c = COLOR.バー枠) => ({ style: 'medium', color: { argb: c } });

/** @param {string} k */
const fontColor = (k) => COLOR[k] ?? COLOR.自社;

/**
 * @param {import('../types.js').Koutei} koutei
 * @returns {Promise<Blob>}
 */
export async function exportKouteiAsXlsx(koutei) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = '現場工程表';
  wb.created = new Date();

  const block = koutei.工事ブロック[0];
  const dates = dateRange(koutei.meta.対象期間.開始, koutei.meta.対象期間.終了);
  const N = dates.length;

  const ws = wb.addWorksheet('工程表', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    },
    views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }]   // ヘッダ・項目列固定
  });

  // 列構成
  const COL_LABEL = 1;
  const COL_DATE_START = 2;
  const COL_REMARK = 2 + N;
  const COL_TOTAL = 3 + N;
  const TOTAL_COLS = 3 + N;

  // 列幅（固定）
  const dayWidth = N <= 16 ? 8 : 5;
  ws.getColumn(COL_LABEL).width = 14;
  for (let i = 0; i < N; i++) ws.getColumn(COL_DATE_START + i).width = dayWidth;
  ws.getColumn(COL_REMARK).width = 18;
  ws.getColumn(COL_TOTAL).width = 8;

  // バー画像（黒線・斜線）を一度だけ作って ID を取得
  const normalBarId = wb.addImage({ base64: makeBarImageBase64(false), extension: 'png' });
  const kyukoBarId  = wb.addImage({ base64: makeBarImageBase64(true),  extension: 'png' });

  // ──── 行1: タイトル
  let r = 1;
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `工程表（${koutei.meta.提出種別}）　${koutei.meta.対象期間.開始} 〜 ${koutei.meta.対象期間.終了}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells(r, 1, r, TOTAL_COLS);
  ws.getRow(r).height = 22;

  // ──── 行2: メタ
  r++;
  const meta = [
    ['発注者', koutei.meta.発注者 ?? ''],
    ['工事番号', block.工事番号 ?? ''],
    ['工事名', block.工事名 ?? ''],
    ['職長', block.職長名 ?? '']
  ];
  setMetaRow(ws, r, meta, TOTAL_COLS);
  ws.getRow(r).height = 20;

  // ──── 行3: 余白
  r++;
  ws.getRow(r).height = 6;

  // ──── 行4: 空き or 期間情報
  r++;
  ws.getRow(r).height = 4;

  // ──── 行5: 日付ヘッダ
  r++;
  const headerRow = r;
  styleHeaderCell(ws.getCell(r, COL_LABEL), '項目');
  for (let i = 0; i < N; i++) {
    const cell = ws.getCell(r, COL_DATE_START + i);
    cell.value = `${dayOfWeekJa(dates[i])}\n${dayOfMonth(dates[i])}`;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { bold: true, size: 10 };
    cell.border = boxBorder(BORDER_THIN());
    cell.fill = solidFill(isHoliday(dates[i]) ? COLOR.休日塗り : COLOR.ヘッダ背);
  }
  styleHeaderCell(ws.getCell(r, COL_REMARK), '備考');
  styleHeaderCell(ws.getCell(r, COL_TOTAL), '合計');
  ws.getRow(r).height = 30;

  // ──── バンド行
  for (const band of block.バンド) {
    r++;
    ws.getRow(r).height = 50;   // 3行テキスト + 中央線 のため少し高く

    // ラベル列
    const labCell = ws.getCell(r, COL_LABEL);
    labCell.value = band.ラベル;
    labCell.font = { bold: true, size: 12 };
    labCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labCell.border = boxBorder(BORDER_THIN());

    // 日付セルをまず全部「枠線・休日色」で塗っておく
    for (let i = 0; i < N; i++) {
      const cell = ws.getCell(r, COL_DATE_START + i);
      cell.border = boxBorder(BORDER_THIN());
      if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日塗り);
    }

    // バー描画（横線オブジェクト + セル結合 + 工種名のみ）
    for (const bar of band.バー) {
      const sIdx = dates.indexOf(bar.開始);
      const eIdx = dates.indexOf(bar.終了);
      if (sIdx < 0 || eIdx < 0) continue;
      const sCol = COL_DATE_START + sIdx;
      const eCol = COL_DATE_START + eIdx;
      const imageId = bar.休工 ? kyukoBarId : normalBarId;

      if (sCol < eCol) ws.mergeCells(r, sCol, r, eCol);
      const m = ws.getCell(r, sCol);
      // セル本文は工種名のみ（補足・時間はバルーンへ）
      m.value = bar.ラベル;
      m.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
      m.font = { size: 10, bold: true };

      // 横線画像を セル範囲全体に anchor（透明キャンバスの中央に線が入る）
      ws.addImage(imageId, {
        tl: { col: sCol - 1, row: r - 1 },
        br: { col: eCol,     row: r }
      });

      // バルーン（コメント）：補足/時間のみ
      m.note = {
        texts: [{ text: buildBarNote(bar), font: { size: 10, name: 'Yu Gothic UI' } }],
        margins: { insetmode: 'auto' },
        editAs: 'twoCells'
      };
    }

    // 備考
    const remarkCell = ws.getCell(r, COL_REMARK);
    remarkCell.value = band.備考 || '';
    remarkCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    remarkCell.font = { size: 10 };
    remarkCell.border = boxBorder(BORDER_THIN());

    // 合計
    const totalCell = ws.getCell(r, COL_TOTAL);
    const total = band.バー.reduce((s, b) => s + calcBarHours(b), 0);
    totalCell.value = total ? `${total}h` : '';
    totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalCell.font = { bold: true, color: { argb: 'FF1F6FEB' } };
    totalCell.border = boxBorder(BORDER_THIN());
  }

  // ──── 固定行（人員/重機/回送/車両/その他）
  const FIXED_KEYS = /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他']);
  for (const key of FIXED_KEYS) {
    const M = block.固定行数[key];
    const startR = r + 1;
    for (let si = 0; si < M; si++) {
      r++;
      ws.getRow(r).height = 22;

      const subLabel = block.固定行ラベル?.[key]?.[si] ?? '';
      const labCell = ws.getCell(r, COL_LABEL);
      // ラベル表示: 人員のみサブ行ラベル(自社/外注)を併記、他は項目名のみ
      if (key === '人員') {
        labCell.value = si === 0 ? `${key}\n${subLabel}` : subLabel;
      } else {
        labCell.value = si === 0 ? key : '';
      }
      labCell.font = { bold: true, size: 10 };
      labCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      labCell.fill = solidFill(COLOR.固定行背);
      labCell.border = boxBorder(BORDER_THIN());

      // 値 + 接尾辞（[リース]/[外注]）
      for (let i = 0; i < N; i++) {
        const cell = ws.getCell(r, COL_DATE_START + i);
        cell.border = boxBorder(BORDER_THIN());
        if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日塗り);
        const entry = block.日次セル[dates[i]]?.[key]?.[si];
        if (entry?.値) {
          let suffix = '';
          if (key !== '人員') {
            if (entry.区分 === 'リース') suffix = '[リース]';
            else if (entry.区分 === '外注') suffix = '[外注]';
          }
          cell.value = entry.値 + suffix;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { bold: true, color: { argb: fontColor(entry.区分) }, size: 10 };
        }
      }
      ws.getCell(r, COL_REMARK).border = boxBorder(BORDER_THIN());
      ws.getCell(r, COL_REMARK).fill = solidFill(COLOR.固定行背);

      // 合計列：人員のみ数値合計を表示
      const totalCell = ws.getCell(r, COL_TOTAL);
      totalCell.border = boxBorder(BORDER_THIN());
      totalCell.fill = solidFill(COLOR.固定行背);
      if (key === '人員') {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          const v = block.日次セル[dates[i]]?.[key]?.[si]?.値;
          const n = Number(v);
          if (!isNaN(n) && v !== '') sum += n;
        }
        if (sum > 0) {
          totalCell.value = sum;
          totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
          totalCell.font = { bold: true, color: { argb: 'FF1F6FEB' }, size: 10 };
        }
      }
    }
    // 非人員はラベル列をマージ（項目名を縦に表示するため）
    if (key !== '人員' && M > 1) {
      ws.mergeCells(startR, COL_LABEL, r, COL_LABEL);
    }
  }

  // 印刷タイトル
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  ws.pageSetup.printArea = `A1:${ws.getColumn(TOTAL_COLS).letter}${r}`;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ───────────── 補助 ─────────────

/** @param {string} d */
function isHoliday(d) {
  const dow = new Date(d).getDay();
  return dow === 0 || dow === 6 || !!holidayOf(d);
}

/** @param {string} c */
function solidFill(c) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
}

function boxBorder(s) {
  return { top: s, left: s, bottom: s, right: s };
}

/**
 * @param {*} cell
 * @param {string} text
 */
function styleHeaderCell(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 11 };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = solidFill(COLOR.ヘッダ背);
  cell.border = boxBorder(BORDER_THIN());
}

/**
 * メタ4組を1行に配置
 * @param {*} ws
 * @param {number} r
 * @param {[string, string][]} items
 * @param {number} totalCols
 */
function setMetaRow(ws, r, items, totalCols) {
  const colsPer = Math.floor(totalCols / items.length);
  let mc = 1;
  for (let i = 0; i < items.length; i++) {
    const [label, value] = items[i];
    const lab = ws.getCell(r, mc);
    lab.value = label;
    lab.font = { bold: true, color: { argb: 'FF6B7280' }, size: 10 };
    lab.alignment = { horizontal: 'right', vertical: 'middle' };
    lab.border = boxBorder(BORDER_THIN());

    const valStart = mc + 1;
    const valEnd = i === items.length - 1 ? totalCols : (mc + colsPer - 1);
    const val = ws.getCell(r, valStart);
    val.value = value;
    val.font = { size: 11 };
    val.alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = valStart; c <= valEnd; c++) {
      ws.getCell(r, c).border = boxBorder(BORDER_THIN());
    }
    if (valStart < valEnd) ws.mergeCells(r, valStart, r, valEnd);

    mc += colsPer;
  }
}

/**
 * バーのバルーン（コメント）テキスト：補足と時間のみ（ラベルなし）
 * @param {import('../types.js').Bar} bar
 */
function buildBarNote(bar) {
  const parts = [];
  if (bar.サブラベル) parts.push(bar.サブラベル);
  const total = calcBarHours(bar);
  if (total) parts.push(`${total}h`);
  if (bar.休工) parts.push('休工');
  if (bar.日別) {
    const half = Object.entries(bar.日別).filter(([_, v]) => v !== '全日');
    if (half.length) {
      parts.push(half.map(([d, v]) => `${d.slice(5)} ${v}`).join(', '));
    }
  }
  return parts.join('\n') || ' ';
}

/**
 * バー画像：透明キャンバス上の中央に横線を描画
 * （セル範囲全体に anchor して、線の長さを正しく表示するため）
 * @param {boolean} 休工
 */
function makeBarImageBase64(休工) {
  const canvas = document.createElement('canvas');
  const W = 1000;
  const H = 60;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, W, H);  // 透明
  const barTop = H * 0.42;
  const barH = H * 0.20;
  if (休工) {
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(0, barTop, W, barH);
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1;
    for (let x = -barH; x < W + barH; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, barTop);
      ctx.lineTo(x + barH, barTop + barH);
      ctx.stroke();
    }
    ctx.strokeStyle = '#6B7280';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, barTop, W - 1, barH);
  } else {
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(0, barTop, W, barH);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}
