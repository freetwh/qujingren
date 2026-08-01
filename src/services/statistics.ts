import type { CommodityRecord, AveragePrice } from '../types';

/** IQR 异常值剔除 */
function filterOutliers(prices: number[]): { filtered: number[]; outlierCount: number } {
  if (prices.length < 4) {
    return { filtered: prices, outlierCount: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const filtered = sorted.filter((p) => p >= lowerBound && p <= upperBound);

  return {
    filtered,
    outlierCount: sorted.length - filtered.length,
  };
}

/** 计算均价 */
export function calculateAverage(records: CommodityRecord[]): AveragePrice | null {
  if (records.length === 0) return null;

  const prices = records.map((r) => r.price);
  const { filtered, outlierCount } = filterOutliers(prices);

  if (filtered.length === 0) return null;

  const avgPrice = filtered.reduce((sum, p) => sum + p, 0) / filtered.length;
  const minPrice = Math.min(...filtered);
  const maxPrice = Math.max(...filtered);

  const first = records[0];

  return {
    name: first.name,
    server: first.server,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice,
    maxPrice,
    sampleCount: filtered.length,
    outlierCount,
    date: new Date().toISOString().split('T')[0],
  };
}

/** 按商品+区服分组计算均价 */
export function calculateGroupAverages(records: CommodityRecord[]): AveragePrice[] {
  const groups = new Map<string, CommodityRecord[]>();

  for (const record of records) {
    const key = `${record.name}__${record.server}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  const results: AveragePrice[] = [];
  for (const groupRecords of groups.values()) {
    const avg = calculateAverage(groupRecords);
    if (avg) {
      results.push(avg);
    }
  }

  return results;
}

/** 计算指定商品在各服的均价 */
export function calculateServerAverages(
  records: CommodityRecord[],
  commodityName: string
): AveragePrice[] {
  const filtered = records.filter((r) => r.name === commodityName);
  const groups = new Map<string, CommodityRecord[]>();

  for (const record of filtered) {
    if (!groups.has(record.server)) {
      groups.set(record.server, []);
    }
    groups.get(record.server)!.push(record);
  }

  const results: AveragePrice[] = [];
  for (const [server, serverRecords] of groups) {
    const avg = calculateAverage(serverRecords);
    if (avg) {
      results.push({ ...avg, server });
    }
  }

  return results;
}
