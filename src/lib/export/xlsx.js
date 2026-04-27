// xlsx 出力（ExcelJS 利用）
// 写真様式に近いレイアウトを再現：上部メタ・日付ヘッダ・バンド行(バーをセル結合)・固定行(複数サブ行)・備考・合計

import { dateRange, dayOfWeekJa, dayOfMonth } from '../utils/date.js';
import { holidayOf } from '../data/holidays.js';
import { calcBarHours } from '../types.js';

const COLOR = {
  自社: 'FF1A1A1A',
  リース: 'FF1F6FEB',
  外注: 'FFDC2626',
  休日: 'FFFFF7D6',
  バンド枠: 'FF1A1A1A',
  ヘッダ背景: 'FFF3F4F6',
  固定行背景: 'FFF8F9FA'
};

/** @param {string} kbn */
function fontColor(kbn) {
  return COLOR[kbn] ?? COLOR.自社;
}

/**
 * @param {import('../types.js').Koutei} koutei
 * @returns {Promise<Blob>}
 */
export async function exportKouteiAsXlsx(koutei) {
  // ExcelJS は重いので動的にロード
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = '現場工程表';
  wb.created = new Date();

  const block = koutei.工事ブロック[0];
  const dates = dateRange(koutei.meta.対象期間.開始, koutei.meta.対象期間.終了);

  const ws = wb.addWorksheet('工程表', {
    pageSetup: {
      paperSize: 9,                  // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    }
  });

  // 列構成：
  //  1: 項目ラベル
  //  2..N+1: 各日
  //  N+2: 備考
  //  N+3: 合計
  const N = dates.length;
  const COL_LABEL = 1;
  const COL_DATE_START = 2;
  const COL_REMARK = 2 + N;
  const COL_TOTAL = 3 + N;
  const TOTAL_COLS = 3 + N;

  // 列幅
  ws.getColumn(COL_LABEL).width = 14;
  for (let i = 0; i < N; i++) ws.getColumn(COL_DATE_START + i).width = 6;
  ws.getColumn(COL_REMARK).width = 16;
  ws.getColumn(COL_TOTAL).width = 6;

  // ── タイトル行（行1）
  let r = 1;
  const titleCell = ws.getCell(r, COL_LABEL);
  titleCell.value = `工程表（${koutei.meta.提出種別}）  ${koutei.meta.対象期間.開始} 〜 ${koutei.meta.対象期間.終了}`;
  titleCell.font = { bold: true, size: 14 };
  ws.mergeCells(r, COL_LABEL, r, TOTAL_COLS);
  ws.getRow(r).height = 22;

  // ── メタ行（行2）：発注者 工事番号 工事名 職長
  r++;
  const meta = [
    ['発注者', koutei.meta.発注者],
    ['工事番号', block.工事番号],
    ['工事名', block.工事名],
    ['職長', block.職長名]
  ];
  // 4ペアを横に並べる：ラベル幅1+値幅 を均等配置
  let mc = COL_LABEL;
  const span = Math.max(2, Math.floor(TOTAL_COLS / 4));
  for (const [label, value] of meta) {
    const labCell = ws.getCell(r, mc);
    labCell.value = label;
    labCell.font = { bold: true, color: { argb: 'FF6B7280' } };
    labCell.alignment = { horizontal: 'right', vertical: 'middle' };
    const valCell = ws.getCell(r, mc + 1);
    valCell.value = value;
    valCell.alignment = { horizontal: 'left', vertical: 'middle' };
    if (span > 2) {
      ws.mergeCells(r, mc + 1, r, mc + span - 1);
    }
    mc += span;
  }
  ws.getRow(r).height = 18;

  // ── 空き行
  r++;
  ws.getRow(r).height = 4;

  // ── 日付ヘッダ行
  r++;
  const headerRow = r;
  const labelHeaderCell = ws.getCell(r, COL_LABEL);
  labelHeaderCell.value = '項目';
  styleHeaderCell(labelHeaderCell);
  for (let i = 0; i < N; i++) {
    const cell = ws.getCell(r, COL_DATE_START + i);
    cell.value = `${dayOfWeekJa(dates[i])}\n${dayOfMonth(dates[i])}`;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.font = { bold: true, size: 10 };
    cell.border = thinBorder();
    if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日);
    else cell.fill = solidFill(COLOR.ヘッダ背景);
  }
  ws.getCell(r, COL_REMARK).value = '備考';
  ws.getCell(r, COL_TOTAL).value = '合計';
  styleHeaderCell(ws.getCell(r, COL_REMARK));
  styleHeaderCell(ws.getCell(r, COL_TOTAL));
  ws.getRow(r).height = 30;

  // ── バンド行
  for (const band of block.バンド) {
    r++;
    const labCell = ws.getCell(r, COL_LABEL);
    labCell.value = band.ラベル;
    labCell.font = { bold: true };
    labCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labCell.border = thinBorder();

    // 日付セルを枠線・休日色だけ事前設定
    for (let i = 0; i < N; i++) {
      const cell = ws.getCell(r, COL_DATE_START + i);
      cell.border = thinBorder();
      if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日);
    }

    // バーをセル結合で表現
    for (const bar of band.バー) {
      const sIdx = dates.indexOf(bar.開始);
      const eIdx = dates.indexOf(bar.終了);
      if (sIdx < 0 || eIdx < 0) continue;
      const sCol = COL_DATE_START + sIdx;
      const eCol = COL_DATE_START + eIdx;
      if (sCol < eCol) ws.mergeCells(r, sCol, r, eCol);
      const m = ws.getCell(r, sCol);
      const halfMark = halfDayMark(bar);
      m.value = bar.ラベル + (bar.サブラベル ? '\n' + bar.サブラベル : '') + (halfMark ? '\n' + halfMark : '');
      m.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      m.font = { bold: true, size: 11 };
      // バーの太い枠
      m.border = boldBorder();
      if (bar.休工) {
        m.fill = { type: 'pattern', pattern: 'lightGray' };
      }
    }

    // 備考・合計
    const remarkCell = ws.getCell(r, COL_REMARK);
    remarkCell.value = band.備考 || '';
    remarkCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    remarkCell.border = thinBorder();

    const totalCell = ws.getCell(r, COL_TOTAL);
    const total = band.バー.reduce((s, b) => s + calcBarHours(b), 0);
    totalCell.value = `${total}h`;
    totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalCell.font = { bold: true, color: { argb: 'FF1F6FEB' } };
    totalCell.border = thinBorder();

    ws.getRow(r).height = 26;
  }

  // ── 固定行：人員/重機/回送/車両/その他
  const FIXED_KEYS = /** @type {const} */ (['人員', '重機', '回送', '車両', 'その他']);
  for (const key of FIXED_KEYS) {
    const M = block.固定行数[key];
    const startR = r + 1;
    for (let si = 0; si < M; si++) {
      r++;
      // ラベル：先頭サブ行のみ表示、複数行で結合
      if (si === 0) {
        const labCell = ws.getCell(r, COL_LABEL);
        labCell.value = key;
        labCell.font = { bold: true };
        labCell.alignment = { horizontal: 'center', vertical: 'middle' };
        labCell.fill = solidFill(COLOR.固定行背景);
        labCell.border = thinBorder();
      } else {
        const labCell = ws.getCell(r, COL_LABEL);
        labCell.fill = solidFill(COLOR.固定行背景);
        labCell.border = thinBorder();
      }

      for (let i = 0; i < N; i++) {
        const cell = ws.getCell(r, COL_DATE_START + i);
        const entry = block.日次セル[dates[i]]?.[key]?.[si];
        cell.border = thinBorder();
        if (isHoliday(dates[i])) cell.fill = solidFill(COLOR.休日);
        if (entry?.値) {
          cell.value = entry.値;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { bold: true, color: { argb: fontColor(entry.区分) }, size: 10 };
        }
      }
      // 備考・合計（固定行は空）
      ws.getCell(r, COL_REMARK).border = thinBorder();
      ws.getCell(r, COL_REMARK).fill = solidFill(COLOR.固定行背景);
      ws.getCell(r, COL_TOTAL).border = thinBorder();
      ws.getCell(r, COL_TOTAL).fill = solidFill(COLOR.固定行背景);

      ws.getRow(r).height = 22;
    }
    // ラベル列のサブ行結合（縦）
    if (M > 1) {
      ws.mergeCells(startR, COL_LABEL, r, COL_LABEL);
    }
  }

  // 印刷タイトル：日付ヘッダ行を各ページ繰り返し
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  // 印刷範囲
  ws.pageSetup.printArea = `A1:${ws.getColumn(TOTAL_COLS).letter}${r}`;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─────────── 補助 ───────────

/** @param {string} d */
function isHoliday(d) {
  const dow = new Date(d).getDay();
  return dow === 0 || dow === 6 || !!holidayOf(d);
}

/** @param {string} c */
function solidFill(c) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
}

function thinBorder() {
  const s = { style: 'thin', color: { argb: 'FFD1D5DB' } };
  return { top: s, left: s, bottom: s, right: s };
}

function boldBorder() {
  const s = { style: 'medium', color: { argb: COLOR.バンド枠 } };
  return { top: s, left: s, bottom: s, right: s };
}

/** @param {ExcelJS.Cell} cell */
function styleHeaderCell(cell) {
  cell.font = { bold: true, size: 11 };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = solidFill(COLOR.ヘッダ背景);
  cell.border = thinBorder();
}

/**
 * バーの始日/終日が AM/PM 半日のとき、注記文字列を返す
 * @param {import('../types.js').Bar} bar
 */
function halfDayMark(bar) {
  if (!bar.日別) return '';
  const marks = [];
  if (bar.日別[bar.開始] === 'AM') marks.push('始日AM');
  if (bar.日別[bar.終了] === 'PM') marks.push('終日PM');
  if (bar.休工) marks.push('休工');
  return marks.length ? `(${marks.join('/')})` : '';
}
