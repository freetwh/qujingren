import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, FileText, Package } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { CommoditySummaryList } from '../components/CommoditySummaryList';
import { getAllRecords, getRecordsByDateRange } from '../db';
import { toLocalDateString } from '../services/date';
import type { CommodityRecord } from '../types';

interface DashboardProps {
  lastOcrText: string;
  lastOcrPath: string;
  ocrCopied: boolean;
  onReparseOcr: () => void | Promise<void>;
  onCopyOcr: () => void | Promise<void>;
}

export function Dashboard({
  lastOcrText,
  lastOcrPath,
  ocrCopied,
  onReparseOcr,
  onCopyOcr,
}: DashboardProps) {
  const [records, setRecords] = useState<CommodityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

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
    void loadRecords();
  }, [loadRecords]);

  const commodityCount = useMemo(
    () => new Set(records.map((record) => record.name)).size,
    [records]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Package size={18} className="text-primary-400" />
            <span className="text-sm text-text-secondary">商品名称</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{commodityCount}</div>
        </Card>
        <Card className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Database size={18} className="text-info" />
            <span className="text-sm text-text-secondary">今日采集</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{totalRecords}</div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <FileText size={18} className="text-success" />
            <span className="text-sm text-text-secondary">识别文本</span>
          </div>
          {lastOcrText ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-xs text-text-muted"
                  title={lastOcrPath}
                >
                  图片：{lastOcrPath}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={onReparseOcr}
                    className="cursor-pointer rounded-lg bg-success/20 px-3 py-1.5 text-xs text-success transition-colors hover:bg-success/30"
                  >
                    重新解析并入库
                  </button>
                  <button
                    type="button"
                    onClick={onCopyOcr}
                    className="cursor-pointer rounded-lg bg-primary-600/80 px-3 py-1.5 text-xs text-white transition-colors hover:bg-primary-500"
                  >
                    {ocrCopied ? '已复制' : '复制文字'}
                  </button>
                </div>
              </div>
              <pre className="max-h-[50px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-4 text-sm leading-6 text-text-primary">
                {lastOcrText}
              </pre>
            </>
          ) : (
            <div className="py-2 text-sm text-text-muted">暂无识别文本</div>
          )}
        </Card>
      </div>

      <Card title="商品数据">
        <CommoditySummaryList
          records={records}
          loading={loading}
          className="overflow-hidden rounded-lg border border-white/10"
        />
      </Card>
    </div>
  );
}
