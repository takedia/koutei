import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 期間内の日付配列（YYYY-MM-DD）
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function dateRange(start, end) {
  const out = [];
  let cur = dayjs(start);
  const e = dayjs(end);
  while (cur.isBefore(e) || cur.isSame(e)) {
    out.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return out;
}

/**
 * 日付文字列の曜日（0=日 〜 6=土）
 * @param {string} dateStr
 */
export function dayOfWeek(dateStr) {
  return dayjs(dateStr).day();
}

/**
 * 日付文字列の曜日文字（日月火…）
 * @param {string} dateStr
 */
export function dayOfWeekJa(dateStr) {
  return WEEKDAY_JA[dayjs(dateStr).day()];
}

/**
 * 日付文字列の「日」部分（DD）
 * @param {string} dateStr
 */
export function dayOfMonth(dateStr) {
  return dayjs(dateStr).format('D');
}

/**
 * 日付文字列を YYYY/MM/DD で整形
 * @param {string} dateStr
 */
export function formatYMD(dateStr) {
  return dayjs(dateStr).format('YYYY/MM/DD');
}

/**
 * 月をまたぐ可能性のある期間を「YYYY/M/D - M/D」or 「YYYY/M/D - YYYY/M/D」で
 * @param {string} start
 * @param {string} end
 */
export function formatRange(start, end) {
  const s = dayjs(start);
  const e = dayjs(end);
  if (s.year() === e.year() && s.month() === e.month()) {
    return `${s.format('YYYY/M/D')} - ${e.format('D')}`;
  }
  if (s.year() === e.year()) {
    return `${s.format('YYYY/M/D')} - ${e.format('M/D')}`;
  }
  return `${s.format('YYYY/M/D')} - ${e.format('YYYY/M/D')}`;
}

/**
 * 「+N日」
 * @param {string} dateStr
 * @param {number} days
 */
export function addDays(dateStr, days) {
  return dayjs(dateStr).add(days, 'day').format('YYYY-MM-DD');
}
