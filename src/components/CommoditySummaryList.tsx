import { useMemo, useState, type CSSProperties } from 'react';
import { Check, List, Search, X, XCircle } from 'lucide-react';
import { priceFormatter } from '../services/commodityColumns';
import { toLocalDateString, toLocalMonthString } from '../services/date';
import type { CommodityRecord } from '../types';

interface CommoditySummaryListProps {
  records: CommodityRecord[];
  loading?: boolean;
  stickyHeader?: boolean;
  headerStyle?: CSSProperties;
  className?: string;
}

interface CommoditySummary {
  name: string;
  category: string;
  latest: CommodityRecord;
  count: number;
  servers: string[];
  todayAvg: number | null;
  monthAvg: number | null;
}

/**
 * 新版记录保存完整区服路径，旧版记录只保存小区名。
 * 同一批汇总中两者并存时优先展示完整路径，避免出现
 * “畅玩服 / 天下无双/天下无双”这样的重复名称。
 */
function mergeLegacyServerLabels(servers: string[]): string[] {
  return servers.filter((server) => {
    if (server.includes('/')) return true;
    const shortName = server.trim();
    return !servers.some((candidate) => {
      if (candidate === server || !candidate.includes('/')) return false;
      const segments = candidate.split('/');
      return segments[segments.length - 1].trim() === shortName;
    });
  });
}

function buildCommoditySummaries(records: CommodityRecord[]): CommoditySummary[] {
  const today = toLocalDateString();
  const month = toLocalMonthString();

  type Bucket = {
    name: string;
    category: string;
    latest: CommodityRecord;
    count: number;
    servers: string[];
    todayTotal: number;
    todayCount: number;
    monthTotal: number;
    monthCount: number;
  };

  const map = new Map<string, Bucket>();
  for (const record of records) {
    let bucket = map.get(record.name);
    if (!bucket) {
      bucket = {
        name: record.name,
        category: record.category,
        latest: record,
        count: 0,
        servers: [],
        todayTotal: 0,
        todayCount: 0,
        monthTotal: 0,
        monthCount: 0,
      };
      map.set(record.name, bucket);
    }

    bucket.count += 1;
    if (!bucket.servers.includes(record.server)) bucket.servers.push(record.server);

    if (Number.isFinite(record.price)) {
      if (record.date === today) {
        bucket.todayTotal += record.price;
        bucket.todayCount += 1;
      }
      if (record.date.startsWith(month)) {
        bucket.monthTotal += record.price;
        bucket.monthCount += 1;
      }
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      name: item.name,
      category: item.category,
      latest: item.latest,
      count: item.count,
      servers: mergeLegacyServerLabels(item.servers),
      todayAvg: item.todayCount
        ? Math.round((item.todayTotal / item.todayCount) * 100) / 100
        : null,
      monthAvg: item.monthCount
        ? Math.round((item.monthTotal / item.monthCount) * 100) / 100
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

/** 主窗口与悬浮窗共用的商品名称汇总列表。 */
export function CommoditySummaryList({
  records,
  loading = false,
  stickyHeader = false,
  headerStyle,
  className = '',
}: CommoditySummaryListProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const summaries = useMemo(() => buildCommoditySummaries(records), [records]);
  const query = searchText.trim().toLowerCase();
  const filteredSummaries = useMemo(
    () => (query ? summaries.filter((item) => item.name.toLowerCase().includes(query)) : summaries),
    [query, summaries]
  );

  return (
    <div className={className}>
      <div
        className={`flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2 backdrop-blur-xl ${
          stickyHeader ? 'sticky top-0 z-10' : ''
        }`}
        style={headerStyle}
      >
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-text-secondary">
          <List size={14} />
          名称（{filteredSummaries.length}）
        </span>
        <button
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          title="搜索名称"
          className={`rounded p-1 transition-colors hover:bg-white/10 ${
            searchOpen ? 'text-primary-400' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Search size={14} />
        </button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1 border-b border-white/10 bg-white/5 px-2 py-1.5">
          <input
            autoFocus
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="输入名称过滤..."
            className="min-w-0 flex-1 rounded border border-white/15 bg-background px-2 py-1 text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-primary-500"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              title="清空"
              className="rounded p-1 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
            >
              <XCircle size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            title="确认"
            className="rounded p-1 text-success transition-colors hover:bg-white/10"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSearchOpen(false);
            }}
            title="取消"
            className="rounded p-1 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="px-2 py-10 text-center text-[14px] text-text-muted">加载中...</div>
      ) : filteredSummaries.length === 0 ? (
        <div className="px-2 py-10 text-center text-[14px] text-text-muted">
          {query ? '没有匹配的名称' : '暂无商品数据'}
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {filteredSummaries.map((item) => (
            <li key={item.name} className="px-2 py-2 hover:bg-white/5">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-primary-400">{item.name}</div>
                <div className="truncate text-[13px] text-text-muted">
                  {item.category} · {item.servers.join('/')} · {item.count} 条
                </div>
              </div>
              <div className="mt-1 flex items-baseline gap-3 text-[13px] text-text-muted">
                <span className="inline-flex items-baseline gap-1">
                  最新
                  <span className="font-mono text-[14px] text-text-primary">
                    {priceFormatter.format(Number(item.latest.price))}
                  </span>
                </span>
                <span className="inline-flex items-baseline gap-1">
                  今日
                  <span className="font-mono text-[14px] text-info">
                    {item.todayAvg === null ? '-' : priceFormatter.format(item.todayAvg)}
                  </span>
                </span>
                <span className="inline-flex items-baseline gap-1">
                  本月
                  <span className="font-mono text-[14px] text-success">
                    {item.monthAvg === null ? '-' : priceFormatter.format(item.monthAvg)}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
