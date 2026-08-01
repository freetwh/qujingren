import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, Minus, Package, Database, Upload } from 'lucide-react';
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
import { getAllCommodityNames, getRecordsByName, getRecordsByDateRange } from '../db';
import { calculateServerAverages } from '../services/statistics';
import { getSettings } from '../services/settings';
import type { CommodityRecord, AveragePrice } from '../types';

const COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];

export function Dashboard() {
  const [commodities, setCommodities] = useState<string[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null);
  const [serverAverages, setServerAverages] = useState<AveragePrice[]>([]);
  const [trendData, setTrendData] = useState<Record<string, unknown>[]>([]);
  const [trendServers, setTrendServers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortKey, setSortKey] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const settings = getSettings();

  // 加载商品列表
  const loadCommodities = useCallback(async () => {
    setLoading(true);
    const names = await getAllCommodityNames();
    setCommodities(names);
    const today = new Date().toISOString().split('T')[0];
    const records = await getRecordsByDateRange(today, today);
    setTotalRecords(records.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCommodities();
  }, [loadCommodities]);

  // 选择商品查看详情
  const handleSelectCommodity = useCallback(async (name: string) => {
    setSelectedCommodity(name);
    const records = await getRecordsByName(name);
    const avgs = calculateServerAverages(records, name);
    setServerAverages(avgs);

    // 构建趋势图数据（最近30天）
    const servers = [...new Set(records.map((r) => r.server))];
    setTrendServers(servers);

    const dateMap = new Map<string, Record<string, number>>();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dateMap.set(dateStr, { date: dateStr.slice(5) });
    }

    for (const record of records) {
      const entry = dateMap.get(record.date);
      if (entry) {
        const key = record.server;
        if (!entry[key]) {
          entry[key] = 0;
          entry[`${key}_count`] = 0;
        }
        entry[key] += record.price;
        entry[`${key}_count`] += 1;
      }
    }

    const chartData = Array.from(dateMap.values()).map((entry) => {
      const result: Record<string, unknown> = { date: entry.date };
      for (const server of servers) {
        const total = entry[server] as number | undefined;
        const count = entry[`${server}_count`] as number | undefined;
        if (total && count) {
          result[server] = Math.round((total / count) * 100) / 100;
        }
      }
      return result;
    });

    setTrendData(chartData);
  }, []);

  // 过滤商品列表
  const filteredCommodities = useMemo(() => {
    if (!searchQuery) return commodities;
    return commodities.filter((name) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [commodities, searchQuery]);

  // 商品列表表格列
  const commodityColumns: Column<{ name: string }>[] = useMemo(
    () => [
      {
        key: 'name',
        title: '商品名称',
        sortable: true,
        render: (value) => (
          <span className="font-medium text-primary-400">{String(value)}</span>
        ),
      },
    ],
    []
  );

  // 各服均价表格列
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
        title: '均价 (万两)',
        sortable: true,
        render: (value) => {
          const num = Number(value);
          return (
            <span className="font-mono font-bold text-primary-400">
              {num.toFixed(2)}
            </span>
          );
        },
      },
      {
        key: 'minPrice',
        title: '最低价',
        render: (value) => (
          <span className="text-success">{Number(value).toFixed(2)}</span>
        ),
      },
      {
        key: 'maxPrice',
        title: '最高价',
        render: (value) => (
          <span className="text-danger">{Number(value).toFixed(2)}</span>
        ),
      },
      {
        key: 'sampleCount',
        title: '样本数',
        sortable: true,
        render: (value) => (
          <span className="text-text-secondary">{String(value)}</span>
        ),
      },
      {
        key: 'outlierCount',
        title: '异常剔除',
        render: (value) => {
          const num = Number(value);
          return num > 0 ? (
            <span className="text-warning text-xs">{num} 条</span>
          ) : (
            <span className="text-text-muted text-xs">无</span>
          );
        },
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
    return [...serverAverages].sort((a, b) => {
      const aVal = a[sortKey as keyof AveragePrice];
      const bVal = b[sortKey as keyof AveragePrice];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [serverAverages, sortKey, sortOrder]);

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Package size={18} className="text-primary-400" />
            <span className="text-sm text-text-secondary">商品种类</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{commodities.length}</div>
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
            <Upload size={18} className="text-success" />
            <span className="text-sm text-text-secondary">自动上报</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {settings.autoUpload ? '开启' : '关闭'}
          </div>
        </Card>
      </div>

      {/* 商品列表 */}
      <Card title="商品列表" className="min-h-[200px]">
        <div className="mb-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索商品名称..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <DataTable
          columns={commodityColumns}
          data={filteredCommodities.map((name) => ({ name }))}
          loading={loading}
          emptyText="暂无商品数据，请先截图采集"
          onRowClick={(row) => handleSelectCommodity(row.name)}
          rowClassName={(row) =>
            row.name === selectedCommodity ? 'bg-primary-600/10' : ''
          }
        />
      </Card>

      {/* 选中商品的各服均价 */}
      {selectedCommodity && (
        <Card
          title={`「${selectedCommodity}」各服均价对比`}
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

      {/* 价格趋势图 */}
      {selectedCommodity && trendData.length > 0 && (
        <Card title={`「${selectedCommodity}」30天价格趋势`}>
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
                    value: '价格 (万两)',
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
                {trendServers.map((server, i) => (
                  <Line
                    key={server}
                    type="monotone"
                    dataKey={server}
                    stroke={COLORS[i % COLORS.length]}
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
