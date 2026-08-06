import Dexie, { type EntityTable } from 'dexie';
import type { CommodityRecord, AveragePrice } from '../types';
import { toLocalDateString } from '../services/date';

type LegacyCommodityRecord = Omit<CommodityRecord, 'category'> & {
  category?: string;
};

class CommodityDatabase extends Dexie {
  records!: EntityTable<CommodityRecord, 'id'>;
  averages!: EntityTable<AveragePrice & { id?: number }, 'id'>;

  constructor() {
    super('CommodityDB');

    this.version(1).stores({
      records: '++id, name, seller, server, date, createdAt, [name+server], [name+server+date]',
      averages: '++id, name, server, date, [name+server], [name+server+date]',
    });

    this.version(2)
      .stores({
        records:
          '++id, category, name, seller, server, date, createdAt, [category+name], [category+name+server], [category+name+server+date]',
        averages:
          '++id, category, name, server, date, [category+name], [category+name+server], [category+name+server+date]',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('records')
          .toCollection()
          .modify((record: LegacyCommodityRecord) => {
            if (record.category) return;

            const beastSkill = /^魔兽要诀[（(](.+)[）)]$/.exec(record.name);
            if (beastSkill) {
              record.category = '魔兽要诀';
              record.name = beastSkill[1];
            } else {
              record.category = '其他';
            }
          });
        await transaction.table('averages').clear();
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

/** 按分类、商品名和区服查询记录 */
export async function getRecordsByNameAndServer(
  category: string,
  name: string,
  server: string
) {
  return db.records
    .where('[category+name+server]')
    .equals([category, name, server])
    .reverse()
    .sortBy('createdAt');
}

/** 按商品名查询所有区服记录 */
export async function getRecordsByName(name: string) {
  return db.records.where('name').equals(name).reverse().sortBy('createdAt');
}

/** 按分类和商品名查询记录 */
export async function getRecordsByCategoryAndName(category: string, name: string) {
  return db.records
    .where('[category+name]')
    .equals([category, name])
    .reverse()
    .sortBy('createdAt');
}

/** 获取全部采集记录，最新记录排在前面 */
export async function getAllRecords(): Promise<CommodityRecord[]> {
  return db.records.orderBy('createdAt').reverse().toArray();
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

/** 判断某张截图是否已经成功入库，避免手动重新解析时重复写入 */
export async function hasRecordsForScreenshot(screenshotPath: string): Promise<boolean> {
  return (await db.records.filter((record) => record.screenshotPath === screenshotPath).count()) > 0;
}

/** 删除某张截图产生的记录，供规则升级后重新解析 */
export async function deleteRecordsForScreenshot(screenshotPath: string): Promise<void> {
  const keys = await db.records
    .filter((record) => record.screenshotPath === screenshotPath)
    .primaryKeys();
  await db.records.bulkDelete(keys);
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

/** 获取指定分类、商品和区服的均价历史 */
export async function getAverageHistory(
  category: string,
  name: string,
  server: string,
  days: number = 30
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = toLocalDateString(startDate);

  return db.averages
    .where('[category+name+server+date]')
    .between(
      [category, name, server, startStr],
      [category, name, server, '\uffff'],
      true,
      true
    )
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
