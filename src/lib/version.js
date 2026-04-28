export const version = '0.1.0';

/** Vite の define で埋め込まれるビルド時刻 ISO 文字列 */
// @ts-ignore
export const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

/** 表示用に "MM/DD HH:mm" 形式に短縮した build 識別子 */
export function buildLabel() {
  if (!buildTime) return '';
  const d = new Date(buildTime);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}
