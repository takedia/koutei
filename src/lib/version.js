export const version = '1.0';

/** Vite の define で埋め込まれるビルド時刻 ISO 文字列 */
// @ts-ignore
export const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

/** 表示用の build 識別子 "MMDDhhmm"（連結／区切りなし） */
export function buildLabel() {
  if (!buildTime) return '';
  const d = new Date(buildTime);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}${dd}${hh}${mi}`;
}

/** 画面に出すフル文字列： v + version + MMDDhhmm（連結） */
export function versionLabel() {
  const b = buildLabel();
  return `v${version}${b}`;
}
