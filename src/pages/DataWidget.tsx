import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listen, emitTo } from '@tauri-apps/api/event';
import { GripHorizontal, Lock, Unlock, X, Minus, Plus, Pin, PinOff, XCircle } from 'lucide-react';
// 挂件不直接操作 IndexedDB，所有写操作通过事件通知主窗口代理
import { calculatePeriodAverages } from '../services/statistics';
import { createCommodityColumns } from '../services/commodityColumns';
import { CommoditySummaryList } from '../components/CommoditySummaryList';
import { SCREENSHOT_TIP } from '../constants/tips';
import {
  getWidgetConfig,
  saveWidgetConfig,
  hideWidget,
  setWidgetLocked,
  setWidgetAlwaysOnTop,
  startWidgetDrag,
  getWidgetBounds,
  setWidgetBounds,
  computeResizedBounds,
  type ResizeDirection,
  type WidgetRecognitionStatus,
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

/** 悬浮框名称内联编辑：输入框定宽，避免编辑时撑宽当前列 */
function WidgetEditableName({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (next: string) => void;
}) {
  const initial = String(value ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  if (!editing) {
    return (
      <span
        onClick={(event) => {
          event.stopPropagation();
          setDraft(initial);
          setEditing(true);
        }}
        className="cursor-text rounded px-1 -mx-1 font-medium text-primary-400 hover:bg-white/10"
        title="点击编辑名称"
      >
        {initial || '-'}
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          (event.target as HTMLInputElement).blur();
        } else if (event.key === 'Escape') {
          setDraft(initial);
          setEditing(false);
        }
      }}
      // 固定宽度防止编辑态撑宽列，与名称列实际宽度解耦
      className="w-[110px] max-w-full rounded border border-primary-500 bg-background px-1 py-0.5 text-[14px] text-text-primary outline-none"
    />
  );
}

export function DataWidget() {
  const [records, setRecords] = useState<CommodityRecord[]>([]);
  const [config, setConfig] = useState(getWidgetConfig);
  const [highlightCount, setHighlightCount] = useState(0);
  const [recognitionStatus, setRecognitionStatus] = useState<WidgetRecognitionStatus>('idle');
  const [activeTab, setActiveTab] = useState<'realtime' | 'commodity'>('realtime');
  const configRef = useRef(config);
  configRef.current = config;
  /** 是否已收到主窗口的全量数据推送（用于同步请求的重试终止） */
  const syncedRef = useRef(false);

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => {
      document.body.classList.remove('overlay-mode');
    };
  }, []);

  // 首次挂载：向主窗口请求全量数据。
  useEffect(() => {
    // 主窗口监听器可能尚未注册（冷启动竞态），单次请求容易丢失，
    // 因此延迟 300ms 首发后每秒重试，直到收到 widget-sync 全量推送为止（最多约 30 次）
    const requestSync = () => {
      emitTo('main', 'widget-request-sync').catch((err) => console.error('请求挂件同步失败:', err));
    };
    const timer = window.setTimeout(requestSync, 300);
    let attempts = 0;
    const retry = window.setInterval(() => {
      attempts += 1;
      if (syncedRef.current || attempts > 30) {
        window.clearInterval(retry);
        return;
      }
      requestSync();
    }, 1000);
    setWidgetLocked(configRef.current.locked).catch(console.error);
    setWidgetAlwaysOnTop(configRef.current.alwaysOnTop).catch(console.error);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(retry);
    };
  }, []);

  /** 增量新增：把主窗口刚入库的记录插到顶部并去重，超出上限的旧记录被裁掉 */
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

  /** 全量替换：主窗口响应同步请求时推送的完整数据，直接作为权威列表 */
  const replaceRecords = useCallback((all: CommodityRecord[]) => {
    // 收到全量推送即视为同步链路已通，停止挂载时的重试
    syncedRef.current = true;
    if (all.length === 0) {
      setRecords([]);
      return;
    }
    setRecords(all.slice(0, configRef.current.maxRows));
  }, []);

  /** 纠错：删除单行。删除后本地移除并通知主窗口重载列表 */
  const removeRecord = useCallback(async (record: CommodityRecord) => {
    if (record.id === undefined) return;
    // 删除是数据纠错，与「锁定（禁止移动/缩放）」无关，始终允许
    setRecords((prev) => prev.filter((item) => item.id !== record.id));
    try {
      // 挂件自己的 IndexedDB 是空的，通知主窗口代理删除
      await emitTo('main', 'widget-delete-record', record.id);
    } catch (err) {
      console.error('删除记录失败:', err);
    }
  }, []);

  useEffect(() => {
    const unlistenRecords = listen<CommodityRecord[]>('widget-records', (event) => {
      prependRecords(event.payload ?? []);
    });

    // 数据整体变更（删除/清空/导入）时，不再读自己的空库，
    // 而是请求主窗口把权威全量数据再推一遍。
    const unlistenReload = listen('widget-reload', () => {
      emitTo('main', 'widget-request-sync').catch((err) => console.error('请求挂件同步失败:', err));
    });

    // 主窗口响应同步请求，推送全量数据
    const unlistenSync = listen<CommodityRecord[]>('widget-sync', (event) => {
      replaceRecords(event.payload ?? []);
    });

    // 主窗口 OCR 识别状态切换
    const unlistenRecognitionStatus = listen<WidgetRecognitionStatus>(
      'widget-recognition-status',
      (event) => {
        setRecognitionStatus(event.payload);
      }
    );

    return () => {
      unlistenRecords.then((fn) => fn());
      unlistenReload.then((fn) => fn());
      unlistenSync.then((fn) => fn());
      unlistenRecognitionStatus.then((fn) => fn());
    };
  }, [prependRecords, replaceRecords]);

  const periodAverages = useMemo(() => calculatePeriodAverages(records), [records]);
  const columns = useMemo(() => createCommodityColumns(periodAverages, true), [periodAverages]);

  const toggleLock = useCallback(async () => {
    const next = saveWidgetConfig({ locked: !configRef.current.locked });
    setConfig(next);
    try {
      await setWidgetLocked(next.locked);
    } catch (err) {
      console.error('切换锁定状态失败:', err);
    }
  }, []);

  /** 切换置顶：默认不置顶，开启后才浮于最上层 */
  const toggleAlwaysOnTop = useCallback(async () => {
    const next = saveWidgetConfig({ alwaysOnTop: !configRef.current.alwaysOnTop });
    setConfig(next);
    try {
      await setWidgetAlwaysOnTop(next.alwaysOnTop);
    } catch (err) {
      console.error('切换置顶状态失败:', err);
    }
  }, []);

  /** 名称编辑：把同一分类+名称+区服的记录整体改名，与同名数据在统计上合并 */
  const handleNameEdit = useCallback(async (row: CommodityRecord, value: string) => {
    const next = value.trim();
    if (!next || next === row.name) return;
    try {
      // 挂件自己的 IndexedDB 是空的，通知主窗口代理重命名
      await emitTo('main', 'widget-rename-record', {
        category: row.category,
        oldName: row.name,
        server: row.server,
        newName: next,
      });
    } catch (err) {
      console.error('重命名记录失败:', err);
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
  const beginResize = useCallback(async (event: React.MouseEvent, direction: ResizeDirection) => {
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
  }, []);

  const { locked, opacity } = config;

  /**
   * 吸顶层（标题栏 / 表头 / 工具条）的底色。
   *
   * 它们盖在内容之上必须不透明于正文，否则滚动时文字会互相透出；
   * 但又不能写死，否则加减透明度时这几处会「固定发实」。
   * 这里按窗口透明度按比例抬高一点，保证遮挡效果的同时整体一起变化。
   */
  const overlayOpacity = Math.min(1, opacity + 0.12);
  const overlayBackground = `rgba(15, 15, 26, ${overlayOpacity})`;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden rounded-xl border border-white/20 text-text-primary shadow-2xl backdrop-blur-2xl"
      style={{
        backgroundColor: `rgba(15, 15, 26, ${opacity})`,
        // 供 .widget-scroll 计算滚动条 alpha
        ['--widget-opacity' as string]: String(opacity),
      }}
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
        className={`relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2 backdrop-blur-xl ${
          locked ? '' : 'cursor-move'
        }`}
        style={{ backgroundColor: overlayBackground }}
        onMouseDown={(event) => {
          // 仅左键、且点击的不是按钮时才发起拖拽
          if (locked || event.button !== 0) return;
          if ((event.target as HTMLElement).closest('button')) return;
          startWidgetDrag().catch(console.error);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripHorizontal size={16} className={locked ? 'text-text-muted' : 'text-primary-400'} />
          <button
            type="button"
            onClick={() => setActiveTab('realtime')}
            className={`rounded px-2 py-0.5 text-[14px] font-semibold transition-colors ${
              activeTab === 'realtime'
                ? 'bg-white/15 text-text-primary'
                : 'text-text-secondary hover:bg-white/10 hover:text-text-primary'
            }`}
          >
            实时数据
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commodity')}
            className={`rounded px-2 py-0.5 text-[14px] font-semibold transition-colors ${
              activeTab === 'commodity'
                ? 'bg-white/15 text-text-primary'
                : 'text-text-secondary hover:bg-white/10 hover:text-text-primary'
            }`}
          >
            商品数据
          </button>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-text-secondary">
            {records.length}
          </span>
          {recognitionStatus === 'recognizing' && (
            <span className="inline-flex items-center gap-1 rounded bg-info/20 px-1.5 py-0.5 text-[13px] text-info">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
              识别中
            </span>
          )}
          {recognitionStatus === 'failed' && (
            <span
              title={SCREENSHOT_TIP}
              className="group relative inline-flex cursor-help items-center gap-1 rounded bg-danger/20 px-1.5 py-0.5 text-[13px] text-danger"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              识别失败
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-white/10 bg-background-100 px-3 py-2 text-xs leading-5 text-text-primary opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
              >
                {SCREENSHOT_TIP}
              </span>
            </span>
          )}
          {locked && (
            <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[13px] text-warning">
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
            <Minus size={14} />
          </button>
          <button
            onClick={() => adjustOpacity(0.1)}
            title="提高不透明度"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={toggleLock}
            title={locked ? '解锁（允许移动和缩放）' : '锁定（禁止移动和缩放）'}
            className={`rounded p-1 transition-colors hover:bg-white/10 ${
              locked ? 'text-warning' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button
            onClick={toggleAlwaysOnTop}
            title={config.alwaysOnTop ? '取消置顶' : '置顶（置于所有窗口上方）'}
            className={`rounded p-1 transition-colors hover:bg-white/10 ${
              config.alwaysOnTop
                ? 'text-primary-400'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {config.alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={() => hideWidget().catch(console.error)}
            title="关闭挂件"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-danger/30 hover:text-danger"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 实时数据 / 商品数据 两个标签页 */}
      <div className="widget-scroll relative z-10 flex-1 overflow-auto">
        {activeTab === 'realtime' ? (
          <>
            <table className="w-full">
              <thead
                className="sticky top-0 z-10 backdrop-blur-xl"
                style={{ backgroundColor: overlayBackground }}
              >
                <tr className="border-b border-white/10">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-2 py-2 text-left text-[14px] font-semibold text-text-secondary"
                    >
                      {col.title}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-1 py-2 text-right text-[14px] font-semibold text-text-secondary">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="px-2 py-10 text-center text-[14px] text-text-muted"
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
                          className={`whitespace-nowrap px-2 py-1.5 text-[14px] text-text-primary ${
                            col.key === 'name' ? 'max-w-[150px] truncate' : ''
                          }`}
                        >
                          {col.key === 'name' ? (
                            <WidgetEditableName
                              value={row.name}
                              onCommit={(next) => handleNameEdit(row, next)}
                            />
                          ) : col.render ? (
                            col.render(row[col.key as keyof CommodityRecord], row, index)
                          ) : (
                            String(row[col.key as keyof CommodityRecord] ?? '-')
                          )}
                        </td>
                      ))}
                      <td className="px-1 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeRecord(row)}
                          title="移除"
                          className="rounded p-1 text-text-muted transition-colors hover:bg-danger/20 hover:text-danger"
                        >
                          <XCircle size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {records.length >= configRef.current.maxRows && (
              <div className="pointer-events-none py-2 text-center text-[13px] text-text-muted">
                实时数据最多展示 {configRef.current.maxRows} 条
              </div>
            )}
          </>
        ) : (
          <CommoditySummaryList
            records={records}
            stickyHeader
            headerStyle={{ backgroundColor: overlayBackground }}
          />
        )}
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
