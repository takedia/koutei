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
    ws.getRow(r).height = 40;

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

    // バー描画（横線オブジェクトを画像として埋め込み）
    for (const bar of band.バー) {
      const sIdx = dates.indexOf(bar.開始);
      const eIdx = dates.indexOf(bar.終了);
      if (sIdx < 0 || eIdx < 0) continue;
      const sCol = COL_DATE_START + sIdx;
      const eCol = COL_DATE_START + eIdx;
      const imageId = bar.休工 ? kyukoBarId : normalBarId;
      ws.addImage(imageId, {
        tl: { col: sCol - 1 + 0.05, row: r - 1 + 0.42 },
        br: { col: eCol - 0.05,     row: r - 1 + 0.62 }
      });
      // バルーン（コメント）：マウスオーバーで詳細を確認
      const note = buildBarNote(bar);
      for (let c = sCol; c <= eCol; c++) {
        ws.getCell(r, c).note = note;
      }
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
    for (let si = 0; si < M; si++) {
      r++;
      ws.getRow(r).height = 22;

      const subLabel = block.固定行ラベル?.[key]?.[si] ?? '';
      const labText = si === 0 ? `${key}\n${subLabel}` : subLabel;
      const labCell = ws.getCell(r, COL_LABEL);
      labCell.value = labText;
      labCell.font = { bold: true, size: 10 };
      labCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      labCell.fill = solidFill(COLOR.固定行背);
      labCell.border = boxBorder(BORDER_THIN());

      for (let i = 0; i < N; i++) {
        const cell = ws.getCell(r, COL_DATE_START + i);
        cell.border = boxBorder(BORDER_THIN());
        if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日塗り);
        const entry = block.日次セル[dates[i]]?.[key]?.[si];
        if (entry?.値) {
          // ラベルが「自社」以外なら「値(ラベル)」と表記、自社/空ならそのまま
          const showSuffix = subLabel && subLabel !== '自社';
          cell.value = showSuffix ? `${entry.値}(${subLabel})` : entry.値;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { bold: true, color: { argb: fontColor(entry.区分) }, size: 10 };
        }
      }
      ws.getCell(r, COL_REMARK).border = boxBorder(BORDER_THIN());
      ws.getCell(r, COL_REMARK).fill = solidFill(COLOR.固定行背);
      ws.getCell(r, COL_TOTAL).border = boxBorder(BORDER_THIN());
      ws.getCell(r, COL_TOTAL).fill = solidFill(COLOR.固定行背);
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
 * バーのバルーン（コメント）テキスト
 * @param {import('../types.js').Bar} bar
 */
function buildBarNote(bar) {
  const lines = [];
  lines.push(`工種: ${bar.ラベル}`);
  if (bar.サブラベル) lines.push(`補足: ${bar.サブラベル}`);
  lines.push(`期間: ${bar.開始} 〜 ${bar.終了}`);
  lines.push(`合計: ${calcBarHours(bar)}h`);
  if (bar.休工) lines.push('休工扱い');
  if (bar.日別) {
    const half = Object.entries(bar.日別).filter(([_, v]) => v !== '全日');
    if (half.length) lines.push('半日: ' + half.map(([d, v]) => `${d.slice(5)} ${v}`).join(', '));
  }
  return lines.join('\n');
}

/**
 * バー画像（横線）を Canvas で生成して base64 で返す
 * @param {boolean} 休工
 */
function makeBarImageBase64(休工) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 18;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  if (休工) {
    // 灰色 + 斜線（休工）
    ctx.fillStyle = '#D1D5DB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#6B7280';
    ctx.lineWidth = 1;
    for (let x = -canvas.height; x < canvas.width + canvas.height; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + canvas.height, canvas.height);
      ctx.stroke();
    }
    // 上下に枠線
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  } else {
    // 黒の太い横線
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}
