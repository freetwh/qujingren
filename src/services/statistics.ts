import type { CommodityRecord, AveragePrice, PeriodAverageMap } from '../types';
import { toLocalDateString, toLocalMonthString } from './date';

/** 商品唯一键：分类 + 名称 + 区服，均价必须在同一区服内比较 */
export function getCommodityKey(
  record: Pick<CommodityRecord, 'category' | 'name' | 'server'>
): string {
  return `${record.category}\u0000${record.name}\u0000${record.server}`;
}

/**
 * 预计算每个「分类+名称+区服」在今日与本月的均价。
 *
 * 一次遍历同时累加两个维度，避免在表格渲染时对每一行重复过滤全量数据。
 */
export function calculatePeriodAverages(
  records: CommodityRecord[],
  now = new Date()
): PeriodAverageMap {
  const today = toLocalDateString(now);
  const month = toLocalMonthString(now);

  const todaySum = new Map<string, { total: number; count: number }>();
  const monthSum = new Map<string, { total: number; count: number }>();

  const accumulate = (
    target: Map<string, { total: number; count: number }>,
    key: string,
    price: number
  ) => {
    const entry = target.get(key);
    if (entry) {
      entry.total += price;
      entry.count += 1;
    } else {
      target.set(key, { total: price, count: 1 });
    }
  };

  for (const record of records) {
    if (!Number.isFinite(record.price)) continue;
    const key = getCommodityKey(record);

    if (record.date === today) {
      accumulate(todaySum, key, record.price);
    }
    if (record.date.startsWith(month)) {
      accumulate(monthSum, key, record.price);
    }
  }

  const result: PeriodAverageMap = new Map();
  const keys = new Set([...todaySum.keys(), ...monthSum.keys()]);

  for (const key of keys) {
    const todayEntry = todaySum.get(key);
    const monthEntry = monthSum.get(key);
    result.set(key, {
      todayAvg: todayEntry ? Math.round((todayEntry.total / todayEntry.count) * 100) / 100 : null,
      todayCount: todayEntry?.count ?? 0,
      monthAvg: monthEntry ? Math.round((monthEntry.total / monthEntry.count) * 100) / 100 : null,
      monthCount: monthEntry?.count ?? 0,
    });
  }

  return result;
}

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
