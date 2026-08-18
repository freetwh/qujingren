import { invoke } from '@tauri-apps/api/core';
import type { CommodityRecord, WidgetConfig } from '../types';

const WIDGET_CONFIG_KEY = 'mhxy_widget_config';

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  locked: false,
  opacity: 0.75,
  maxRows: 200,
  alwaysOnTop: false,
};

export function getWidgetConfig(): WidgetConfig {
  try {
    const raw = localStorage.getItem(WIDGET_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_WIDGET_CONFIG };
    return { ...DEFAULT_WIDGET_CONFIG, ...(JSON.parse(raw) as Partial<WidgetConfig>) };
  } catch {
    return { ...DEFAULT_WIDGET_CONFIG };
  }
}

export function saveWidgetConfig(patch: Partial<WidgetConfig>): WidgetConfig {
  const next = { ...getWidgetConfig(), ...patch };
  localStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(next));
  return next;
}

export type ResizeDirection =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north-east'
  | 'north-west'
  | 'south-east'
  | 'south-west';

export interface WidgetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const showWidget = () => invoke<void>('show_widget');
export const hideWidget = () => invoke<void>('hide_widget');
export const isWidgetVisible = () => invoke<boolean>('is_widget_visible');
export const startWidgetDrag = () => invoke<void>('start_widget_drag');
export const setWidgetLocked = (locked: boolean) =>
  invoke<void>('set_widget_locked', { locked });
export const setWidgetAlwaysOnTop = (alwaysOnTop: boolean) =>
  invoke<void>('set_widget_always_on_top', { alwaysOnTop });
export const getWidgetBounds = () => invoke<WidgetBounds>('get_widget_bounds');
export const setWidgetBounds = (bounds: WidgetBounds) =>
  invoke<void>('set_widget_bounds', { ...bounds });

/** 各方向缩放时，鼠标位移对 x/y/width/height 的影响系数 */
const RESIZE_FACTORS: Record<
  ResizeDirection,
  { dx: number; dy: number; dw: number; dh: number }
> = {
  north: { dx: 0, dy: 1, dw: 0, dh: -1 },
  south: { dx: 0, dy: 0, dw: 0, dh: 1 },
  west: { dx: 1, dy: 0, dw: -1, dh: 0 },
  east: { dx: 0, dy: 0, dw: 1, dh: 0 },
  'north-west': { dx: 1, dy: 1, dw: -1, dh: -1 },
  'north-east': { dx: 0, dy: 1, dw: 1, dh: -1 },
  'south-west': { dx: 1, dy: 0, dw: -1, dh: 1 },
  'south-east': { dx: 0, dy: 0, dw: 1, dh: 1 },
};

export const MIN_WIDGET_WIDTH = 320;
export const MIN_WIDGET_HEIGHT = 180;

/** 根据起始几何与鼠标位移计算目标窗口几何，含最小尺寸钳制 */
export function computeResizedBounds(
  start: WidgetBounds,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number
): WidgetBounds {
  const factor = RESIZE_FACTORS[direction];

  // 先按最小尺寸夹住位移，避免拖过头后窗口位置继续跑偏
  let dx = deltaX;
  let dy = deltaY;

  if (factor.dw !== 0) {
    const width = start.width + factor.dw * deltaX;
    if (width < MIN_WIDGET_WIDTH) {
      dx = (factor.dw * (MIN_WIDGET_WIDTH - start.width)) / (factor.dw * factor.dw);
    }
  }
  if (factor.dh !== 0) {
    const height = start.height + factor.dh * deltaY;
    if (height < MIN_WIDGET_HEIGHT) {
      dy = (factor.dh * (MIN_WIDGET_HEIGHT - start.height)) / (factor.dh * factor.dh);
    }
  }

  return {
    x: start.x + factor.dx * dx,
    y: start.y + factor.dy * dy,
    width: Math.max(MIN_WIDGET_WIDTH, start.width + factor.dw * dx),
    height: Math.max(MIN_WIDGET_HEIGHT, start.height + factor.dh * dy),
  };
}

/** 主窗口把刚入库的记录增量推送给挂件，实现无轮询的实时更新 */
export const pushWidgetRecords = (records: CommodityRecord[]) =>
  invoke<void>('push_widget_records', { payload: records });

/** 主窗口把全部记录的权威快照推送给挂件（挂件自身 IndexedDB 为空，必须靠此同步） */
export const syncWidgetRecords = (records: CommodityRecord[]) =>
  invoke<void>('sync_widget_records', { payload: records });

/** 数据被整体清空/替换时，通知挂件全量重载（经 Rust 定向推送到挂件窗口） */
export const reloadWidget = () =>
  invoke<void>('emit_widget_reload');

export type WidgetRecognitionStatus = 'idle' | 'recognizing' | 'failed';

/** OCR 识别状态广播：挂件标题栏据此显示识别进度或失败提示（经 Rust 定向推送） */
export const setWidgetRecognitionStatus = (status: WidgetRecognitionStatus) =>
  invoke<void>('emit_widget_recognition_status', { status });
