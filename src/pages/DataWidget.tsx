import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { GripHorizontal, Lock, Unlock, X, Minus, Plus, Trash2 } from 'lucide-react';
import { getAllRecords, deleteRecord } from '../db';
import { calculatePeriodAverages } from '../services/statistics';
import { createCommodityColumns } from '../services/commodityColumns';
import {
  getWidgetConfig,
  saveWidgetConfig,
  hideWidget,
  setWidgetLocked,
  startWidgetDrag,
  getWidgetBounds,
  setWidgetBounds,
  computeResizedBounds,
  reloadWidget,
  type ResizeDirection,
} from '../services/widget';
import type { CommodityRecord } from '../types';

/** 8 个缩放热区：内联定位样式 + 对应的系统缩放方向 */
const RESIZE_HANDLES: {
  direction: ResizeDirection;
  className: string;
}[] = [
  { direction: 'north', className: 'top-0 left-2 right-2 h-1.5 cursor-n-resize' },
  { direction: 'south', className: 'bottom-0 left-2 right-2 h-1.5 cursor-s-resize' },
  { direction: 'west', className: 'left-0 top-2 bottom-2 w-1.5 cursor-w-resize' },
  { direction: 'east', className: 'right-0 top-2 bottom-2 w-1.5 cursor-e-resize' },
  { direction: 'north-west', className: 'top-0 left-0 w-3 h-3 cursor-nw-resize' },
  { direction: 'north-east', className: 'top-0 right-0 w-3 h-3 cursor-ne-resize' },
  { direction: 'south-west', className: 'bottom-0 left-0 w-3 h-3 cursor-sw-resize' },
  { direction: 'south-east', className: 'bottom-0 right-0 w-3 h-3 cursor-se-resize' },
];

/** 同一条记录的去重键，避免推送与全量刷新产生重复行 */
function recordKey(record: CommodityRecord, index: number): string {
  if (record.id !== undefined) return `id-${record.id}`;
  return `${record.category}\u0000${record.name}\u0000${record.server}\u0000${record.price}\u0000${record.createdAt}\u0000${index}`;
}

export function DataWidget() {
  const [records, setRecords] = useState<CommodityRecord[]>([]);
  const [config, setConfig] = useState(getWidgetConfig);
  const [highlightCount, setHighlightCount] = useState(0);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => {
      document.body.classList.remove('overlay-mode');
    };
  }, []);

  // 首次挂载拉取历史数据；锁定状态需要同步到窗口，避免刷新后状态与窗口不一致
  useEffect(() => {
    getAllRecords()
      .then((all) => setRecords(all.slice(0, configRef.current.maxRows)))
      .catch(console.error);
    setWidgetLocked(configRef.current.locked).catch(console.error);
  }, []);

  /** 新记录插到顶部并去重，超出上限的旧记录被裁掉 */
  const prependRecords = useCallback((incoming: CommodityRecord[]) => {
    if (incoming.length === 0) return;

    setRecords((prev) => {
      const incomingKeys = new Set(incoming.map((item, i) => recordKey(item, i)));
      const kept = prev.filter((item, i) => !incomingKeys.has(recordKey(item, i)));
      return [...incoming, ...kept].slice(0, configRef.current.maxRows);
    });

    // 顶部新增行做一次高亮提示
    setHighlightCount(incoming.length);
    window.setTimeout(() => setHighlightCount(0), 2000);
  }, []);

  /** 纠错：删除单行。删除后本地移除并通知主窗口重载列表 */
  const removeRecord = useCallback(async (record: CommodityRecord) => {
    if (record.id === undefined) return;
    // 删除是数据纠错，与「锁定（禁止移动/缩放）」无关，始终允许
    setRecords((prev) => prev.filter((item) => item.id !== record.id));
    try {
      await deleteRecord(record.id);
      // 通知主窗口（Dashboard）重新加载，保持两端数据一致
      await reloadWidget().catch(console.error);
    } catch (err) {
      console.error('删除记录失败:', err);
    }
  }, []);

  useEffect(() => {
    const unlistenRecords = listen<CommodityRecord[]>('widget-records', (event) => {
      prependRecords(event.payload ?? []);
    });

    // 数据被清空/导入等整体变更时全量重载
    const unlistenReload = listen('widget-reload', () => {
      getAllRecords()
        .then((all) => setRecords(all.slice(0, configRef.current.maxRows)))
        .catch(console.error);
    });

    return () => {
      unlistenRecords.then((fn) => fn());
      unlistenReload.then((fn) => fn());
    };
  }, [prependRecords]);

  const periodAverages = useMemo(() => calculatePeriodAverages(records), [records]);
  const columns = useMemo(
    () => createCommodityColumns(periodAverages, true),
    [periodAverages]
  );

  const toggleLock = useCallback(async () => {
    const next = saveWidgetConfig({ locked: !configRef.current.locked });
    setConfig(next);
    try {
      await setWidgetLocked(next.locked);
    } catch (err) {
      console.error('切换锁定状态失败:', err);
    }
  }, []);

  const adjustOpacity = useCallback((delta: number) => {
    const opacity = Math.min(0.95, Math.max(0.2, configRef.current.opacity + delta));
    setConfig(saveWidgetConfig({ opacity }));
  }, []);

  /**
   * 边缘拖拽缩放。
   *
   * 用 screenX/screenY 计算位移：窗口尺寸变化会让 clientX/clientY 的参考系跟着变，
   * 导致反馈抖动；屏幕坐标不受窗口自身影响，拖拽更稳。
   */
  const beginResize = useCallback(
    async (event: React.MouseEvent, direction: ResizeDirection) => {
      if (configRef.current.locked || event.button !== 0) return;
      event.preventDefault();

      let start;
      try {
        start = await getWidgetBounds();
      } catch (err) {
        console.error('获取挂件几何失败:', err);
        return;
      }

      const originX = event.screenX;
      const originY = event.screenY;
      let pending = false;
      let latest = { x: 0, y: 0 };

      // 用 rAF 合并高频 mousemove，避免每个像素都往 Rust 发一次 IPC
      const flush = () => {
        pending = false;
        setWidgetBounds(
          computeResizedBounds(start, direction, latest.x - originX, latest.y - originY)
        ).catch(console.error);
      };

      const onMove = (moveEvent: MouseEvent) => {
        latest = { x: moveEvent.screenX, y: moveEvent.screenY };
        if (!pending) {
          pending = true;
          requestAnimationFrame(flush);
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    []
  );

  const { locked, opacity } = config;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden rounded-xl border border-white/20 text-text-primary shadow-2xl backdrop-blur-2xl"
      style={{ backgroundColor: `rgba(15, 15, 26, ${opacity})` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 玻璃高光：顶部渐亮 + 内描边，营造透明玻璃质感 */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 35%, rgba(255,255,255,0) 70%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
        }}
      />

      {/* 标题栏：解锁时可拖拽移动窗口 */}
      <div
        className={`relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2 ${
          locked ? '' : 'cursor-move'
        }`}
        onMouseDown={(event) => {
          // 仅左键、且点击的不是按钮时才发起拖拽
          if (locked || event.button !== 0) return;
          if ((event.target as HTMLElement).closest('button')) return;
          startWidgetDrag().catch(console.error);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripHorizontal
            size={14}
            className={locked ? 'text-text-muted' : 'text-primary-400'}
          />
          <span className="truncate text-xs font-semibold">实时数据</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-text-secondary">
            {records.length}
          </span>
          {locked && (
            <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] text-warning">
              已锁定
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => adjustOpacity(-0.1)}
            title="降低不透明度"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => adjustOpacity(0.1)}
            title="提高不透明度"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={toggleLock}
            title={locked ? '解锁（允许移动和缩放）' : '锁定（禁止移动和缩放）'}
            className={`rounded p-1 transition-colors hover:bg-white/10 ${
              locked ? 'text-warning' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button
            onClick={() => hideWidget().catch(console.error)}
            title="关闭挂件"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-danger/30 hover:text-danger"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* 数据表格：列与主看板商品列表一致 */}
      <div className="relative z-10 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
            <tr className="border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold text-text-secondary"
                >
                  {col.title}
                </th>
              ))}
              <th className="whitespace-nowrap px-1 py-1.5 text-right text-[11px] font-semibold text-text-secondary">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-2 py-10 text-center text-xs text-text-muted"
                >
                  暂无数据，截图采集后会实时出现在这里
                </td>
              </tr>
            ) : (
              records.map((row, index) => (
                <tr
                  key={recordKey(row, index)}
                  className={`border-b border-white/5 transition-colors ${
                    index < highlightCount ? 'bg-primary-600/25' : 'hover:bg-white/5'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="whitespace-nowrap px-2 py-1 text-[11px] text-text-primary"
                    >
                      {col.render
                        ? col.render(row[col.key as keyof CommodityRecord], row, index)
                        : String(row[col.key as keyof CommodityRecord] ?? '-')}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRecord(row)}
                      title="删除此行（纠错）"
                      className="rounded p-1 text-text-muted transition-colors hover:bg-danger/20 hover:text-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 缩放热区：锁定时不渲染，彻底禁止改变大小 */}
      {!locked &&
        RESIZE_HANDLES.map((handle) => (
          <div
            key={handle.direction}
            className={`absolute z-20 ${handle.className}`}
            onMouseDown={(event) => beginResize(event, handle.direction)}
          />
        ))}
    </div>
  );
}
