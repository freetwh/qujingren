import type { CommodityRecord, AveragePrice } from '../types';
import { toLocalDateString } from './date';

/** 计算均价 */
export function calculateAverage(records: CommodityRecord[]): AveragePrice | null {
  if (records.length === 0) return null;

  const prices = records.map((r) => r.price);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const first = records[0];

  return {
    category: first.category,
    name: first.name,
    server: first.server,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice,
    maxPrice,
    sampleCount: prices.length,
    outlierCount: 0,
    date: toLocalDateString(),
  };
}

/** 按商品+区服分组计算均价 */
export function calculateGroupAverages(records: CommodityRecord[]): AveragePrice[] {
  const groups = new Map<string, CommodityRecord[]>();

  for (const record of records) {
    const key = `${record.category}__${record.name}__${record.server}`;
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
  commodityCategory: string,
  commodityName: string
): AveragePrice[] {
  const filtered = records.filter(
    (record) => record.category === commodityCategory && record.name === commodityName
  );
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
