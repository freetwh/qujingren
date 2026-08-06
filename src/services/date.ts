/** 使用本机时区生成 YYYY-MM-DD，避免 UTC 日期在凌晨错一天。 */
export function toLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
