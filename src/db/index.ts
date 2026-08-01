import Dexie, { type EntityTable } from 'dexie';
import type { CommodityRecord, AveragePrice } from '../types';

class CommodityDatabase extends Dexie {
  records!: EntityTable<CommodityRecord, 'id'>;
  averages!: EntityTable<AveragePrice & { id?: number }, 'id'>;

  constructor() {
    super('CommodityDB');

    this.version(1).stores({
      records: '++id, name, seller, server, date, createdAt, [name+server], [name+server+date]',
      averages: '++id, name, server, date, [name+server], [name+server+date]',
    });
  }
}

export const db = new CommodityDatabase();

/** 添加商品记录 */
export async function addRecord(record: Omit<CommodityRecord, 'id' | 'createdAt'>) {
  return db.records.add({
    ...record,
    createdAt: new Date().toISOString(),
  });
}

/** 按商品名和区服查询记录 */
export async function getRecordsByNameAndServer(name: string, server: string) {
  return db.records
    .where('[name+server]')
    .equals([name, server])
    .reverse()
    .sortBy('createdAt');
}

/** 按商品名查询所有区服记录 */
export async function getRecordsByName(name: string) {
  return db.records.where('name').equals(name).reverse().sortBy('createdAt');
}

/** 获取所有商品名称列表 */
export async function getAllCommodityNames(): Promise<string[]> {
  const records = await db.records.orderBy('name').uniqueKeys();
  return records as string[];
}

/** 获取指定日期范围内的记录 */
export async function getRecordsByDateRange(startDate: string, endDate: string) {
  return db.records
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
}

/** 获取所有区服列表 */
export async function getAllServers(): Promise<string[]> {
  const servers = await db.records.orderBy('server').uniqueKeys();
  return servers as string[];
}

/** 保存均价统计 */
export async function saveAverage(avg: Omit<AveragePrice, 'id'>) {
  return db.averages.add(avg);
}

/** 获取指定商品和区服的均价历史 */
export async function getAverageHistory(name: string, server: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  return db.averages
    .where('[name+server+date]')
    .between([name, server, startStr], [name, server, '\uffff'], true, true)
    .sortBy('date');
}

/** 清空所有数据 */
export async function clearAllData() {
  await db.records.clear();
  await db.averages.clear();
}

/** 导出所有数据为 JSON */
export async function exportAllData() {
  const records = await db.records.toArray();
  const averages = await db.averages.toArray();
  return { records, averages, exportedAt: new Date().toISOString() };
}
