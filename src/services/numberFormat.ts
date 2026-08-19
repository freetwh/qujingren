import { getSettings } from './settings';
import type { AppSettings } from '../types';

export type NumberDisplayFormat = AppSettings['numberDisplayFormat'];

const commaFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat('zh-CN', {
  useGrouping: false,
  maximumFractionDigits: 2,
});

/**
 * 游戏币数字格式化。
 *
 * 中文单位模式会把亿拆成“亿 + 万”，例如 123456789 显示为
 * “1 亿 2345.68 万”；不足一亿但达到一万时显示为“1234.57 万”。
 */
export function formatGameNumber(
  value: number,
  format: NumberDisplayFormat = getSettings().numberDisplayFormat
): string {
  if (format === 'comma' || !Number.isFinite(value)) {
    return commaFormatter.format(value);
  }

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);

  if (absolute < 10_000) {
    return `${sign}${plainFormatter.format(absolute)}`;
  }

  // 中文单位只保留到百位游戏币，直接截取而不四舍五入，避免
  // 199999 显示成 20.00 万、199999999 显示成 2 亿。
  const truncatedWan = Math.trunc(absolute / 100) / 100;
  const yi = Math.floor(truncatedWan / 10_000);
  const wan = truncatedWan - yi * 10_000;

  if (yi > 0) {
    const yiText = `${sign}${plainFormatter.format(yi)} 亿`;
    return wan > 0 ? `${yiText} ${wan.toFixed(2)} 万` : yiText;
  }

  return `${sign}${truncatedWan.toFixed(2)} 万`;
}

/** 保留原有 formatter 调用形式，让主窗口和悬浮窗继续共用同一入口。 */
export const priceFormatter = {
  format(value: number): string {
    return formatGameNumber(value);
  },
};
