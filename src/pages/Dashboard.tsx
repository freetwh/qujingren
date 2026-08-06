import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Package, Database, HardDrive } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DataTable, type Column } from '../components/ui/Table';
import { Card } from '../components/ui/Card';
import {
  getAllRecords,
  getRecordsByCategoryAndName,
  getRecordsByDateRange,
} from '../db';
import { calculateServerAverages } from '../services/statistics';
import { priceFormatter } from '../services/commodityColumns';
import { toLocalDateString } from '../services/date';
import type { AveragePrice, CommodityRecord } from '../types';

const COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];

interface SelectedCommodity {
  category: string;
  name: string;
}

export function Dashboard() {
  const [records, setRecords] = useState<CommodityRecord[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<SelectedCommodity | null>(null);
  const [serverAverages, setServerAverages] = useState<AveragePrice[]>([]);
  const [trendData, setTrendData] = useState<Record<string, unknown>[]>([]);
  const [trendServers, setTrendServers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortKey, setSortKey] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const today = toLocalDateString();
    const [allRecords, todayRecords] = await Promise.all([
      getAllRecords(),
      getRecordsByDateRange(today, today),
    ]);
    setRecords(allRecords);
    setTotalRecords(todayRecords.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const commodityCount = useMemo(
    () => new Set(records.map((record) => `${record.category}\u0000${record.name}`)).size,
    [records]
  );

  const handleSelectCommodity = useCallback(async (target: SelectedCommodity) => {
    const selection = { category: target.category, name: target.name };
    setSelectedCommodity(selection);

    const commodityRecords = await getRecordsByCategoryAndName(
      selection.category,
      selection.name
    );
    setServerAverages(
      calculateServerAverages(commodityRecords, selection.category, selection.name)
    );

    const servers = [...new Set(commodityRecords.map((item) => item.server))];
    setTrendServers(servers);

    const dateMap = new Map<string, Record<string, unknown>>();
    const now = new Date();
    for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      const dateString = toLocalDateString(date);
      dateMap.set(dateString, { date: dateString.slice(5) });
    }

    for (const item of commodityRecords) {
      const entry = dateMap.get(item.date);
      if (!entry) continue;

      const server = item.server;
      entry[server] = (typeof entry[server] === 'number' ? entry[server] : 0) + item.price;
      const countKey = `${server}_count`;
      entry[countKey] =
        (typeof entry[countKey] === 'number' ? entry[countKey] : 0) + 1;
    }

    const chartData = Array.from(dateMap.values()).map((entry) => {
      const result: Record<string, unknown> = { date: entry.date };
      for (const server of servers) {
        const total = entry[server];
        const count = entry[`${server}_count`];
        if (typeof total === 'number' && typeof count === 'number' && count > 0) {
          result[server] = Math.round((total / count) * 100) / 100;
        }
      }
      return result;
    });

    setTrendData(chartData);
  }, []);

  /** 「分类+名称」维度的可选商品，附带记录条数，供图表选择器使用 */
  const commodityOptions = useMemo(() => {
    const map = new Map<string, SelectedCommodity & { count: number }>();
    for (const record of records) {
      const key = `${record.category}\u0000${record.name}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { category: record.category, name: record.name, count: 1 });
      }
    }

    const query = searchQuery.trim().toLowerCase();
    return Array.from(map.values())
      .filter((item) =>
        query
          ? item.category.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query)
          : true
      )
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
  }, [records, searchQuery]);

  const avgColumns: Column<AveragePrice>[] = useMemo(
    () => [
      {
        key: 'server',
        title: '区服',
        render: (value) => (
          <span className="font-medium text-text-primary">{String(value)}</span>
        ),
      },
      {
        key: 'avgPrice',
        title: '均价（游戏币）',
        sortable: true,
        render: (value) => (
          <span className="font-mono font-bold text-primary-400">
            {priceFormatter.format(Number(value))}
          </span>
        ),
      },
      {
        key: 'minPrice',
        title: '最低价',
        render: (value) => (
          <span className="text-success">{priceFormatter.format(Number(value))}</span>
        ),
      },
      {
        key: 'maxPrice',
        title: '最高价',
        render: (value) => (
          <span className="text-danger">{priceFormatter.format(Number(value))}</span>
        ),
      },
      {
        key: 'sampleCount',
        title: '样本数',
        sortable: true,
        render: (value) => <span className="text-text-secondary">{String(value)}</span>,
      },
    ],
    []
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const sortedAverages = useMemo(() => {
    if (!sortKey) return serverAverages;
    return [...serverAverages].sort((left, right) => {
      const leftValue = left[sortKey as keyof AveragePrice];
      const rightValue = right[sortKey as keyof AveragePrice];
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortOrder === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }
      return 0;
    });
  }, [serverAverages, sortKey, sortOrder]);

  const selectedLabel = selectedCommodity
    ? `${selectedCommodity.category} / ${selectedCommodity.name}`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Package size={18} className="text-primary-400" />
            <span className="text-sm text-text-secondary">商品名称</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{commodityCount}</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Database size={18} className="text-info" />
            <span className="text-sm text-text-secondary">今日采集</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{totalRecords}</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <HardDrive size={18} className="text-success" />
            <span className="text-sm text-text-secondary">存储方式</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">仅本地</div>
        </Card>
      </div>

      {/*
        明细数据表已移到悬浮挂件中查看，这里只保留「选择商品」入口，
        用于驱动下方的各服均价对比与 30 天趋势图。
      */}
      <Card title="选择商品" className="min-h-[160px]">
        <div className="mb-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索分类或名称..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-text-muted">加载中...</div>
        ) : commodityOptions.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-muted">
            暂无商品数据，请先截图采集（明细请在悬浮挂件中查看）
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {commodityOptions.map((option) => {
              const active =
                option.category === selectedCommodity?.category &&
                option.name === selectedCommodity?.name;
              return (
                <button
                  key={`${option.category}\u0000${option.name}`}
                  type="button"
                  onClick={() => handleSelectCommodity(option)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-primary-500 bg-primary-600/20 text-text-primary'
                      : 'border-white/10 bg-white/5 text-text-secondary hover:border-white/20 hover:text-text-primary'
                  }`}
                >
                  <span className="text-text-muted">{option.category} / </span>
                  {option.name}
                  <span className="ml-1.5 text-xs text-text-muted">{option.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selectedCommodity && (
        <Card
          title={`「${selectedLabel}」各服均价对比（游戏币）`}
          action={
            <span className="text-xs text-text-muted">
              共 {serverAverages.length} 个区服
            </span>
          }
        >
          <DataTable
            columns={avgColumns}
            data={sortedAverages}
            emptyText="暂无数据"
            sortKey={sortKey}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </Card>
      )}

      {selectedCommodity && trendData.length > 0 && (
        <Card title={`「${selectedLabel}」30天价格趋势`}>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  stroke="#6B6B80"
                  tick={{ fill: '#A0A0B8', fontSize: 12 }}
                />
                <YAxis
                  stroke="#6B6B80"
                  tick={{ fill: '#A0A0B8', fontSize: 12 }}
                  label={{
                    value: '价格（游戏币）',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#A0A0B8',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 46, 0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#F5F5F5',
                  }}
                />
                <Legend />
                {trendServers.map((server, index) => (
                  <Line
                    key={server}
                    type="monotone"
                    dataKey={server}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
