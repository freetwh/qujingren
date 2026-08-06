import type { Column } from '../components/ui/Table';
import { getCommodityKey } from './statistics';
import type { CommodityRecord, PeriodAverageMap } from '../types';

export const priceFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

/** 均价单元格：无样本显示占位符，有样本时把样本数作为角标 */
function AverageCell({
  value,
  count,
  className,
  compact,
}: {
  value: number | null;
  count: number;
  className: string;
  compact: boolean;
}) {
  if (value === null) {
    return <span className="text-text-muted">-</span>;
  }

  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className={`font-mono ${className}`}>{priceFormatter.format(value)}</span>
      {!compact && <span className="text-[10px] text-text-muted">×{count}</span>}
    </span>
  );
}

/**
 * 商品列表列定义。主看板与桌面挂件共用，保证两处表格列完全一致。
 *
 * @param averages 预计算的今日/本月均价表
 * @param compact 挂件模式下压缩留白并隐藏次要信息
 */
export function createCommodityColumns(
  averages: PeriodAverageMap,
  compact = false
): Column<CommodityRecord>[] {
  return [
    {
      key: 'category',
      title: '分类',
      render: (value) => <span className="text-text-secondary">{String(value)}</span>,
    },
    {
      key: 'name',
      title: '名称',
      render: (value) => (
        <span className="font-medium text-primary-400">{String(value)}</span>
      ),
    },
    {
      key: 'server',
      title: '区服',
    },
    {
      key: 'price',
      title: compact ? '价格' : '价格（游戏币）',
      render: (value) => (
        <span className="font-mono">{priceFormatter.format(Number(value))}</span>
      ),
    },
    {
      key: 'todayAvg',
      title: '今日均价',
      render: (_value, row) => {
        const entry = averages.get(getCommodityKey(row));
        return (
          <AverageCell
            value={entry?.todayAvg ?? null}
            count={entry?.todayCount ?? 0}
            className="text-info"
            compact={compact}
          />
        );
      },
    },
    {
      key: 'monthAvg',
      title: '本月均价',
      render: (_value, row) => {
        const entry = averages.get(getCommodityKey(row));
        return (
          <AverageCell
            value={entry?.monthAvg ?? null}
            count={entry?.monthCount ?? 0}
            className="text-success"
            compact={compact}
          />
        );
      },
    },
    {
      key: 'date',
      title: '日期',
    },
  ];
}
