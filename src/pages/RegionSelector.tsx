import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getSettings } from '../services/settings';

interface WindowRectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
}

interface PendingCapture {
  base64: string;
  width: number;
  height: number;
  activeWindow: WindowRectInfo | null;
  windows: WindowRectInfo[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_DRAG = 10;

export function RegionSelector() {
  const [capture, setCapture] = useState<PendingCapture | null>(null);
  const [hover, setHover] = useState<WindowRectInfo | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [error, setError] = useState('');
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const windowsRef = useRef<WindowRectInfo[]>([]);

  // 加载截图与窗口快照（重置交互状态）
  const loadCapture = useCallback(() => {
    startRef.current = null;
    setDragRect(null);
    setError('');
    invoke<PendingCapture>('get_pending_capture')
      .then((data) => {
        setCapture(data);
        windowsRef.current = data.windows;
        // 默认高亮激活窗口
        setHover(data.activeWindow);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // 窗口是预创建复用的：靠 prepare-capture 事件驱动刷新，而不是重挂载
  useEffect(() => {
    document.body.classList.add('overlay-mode');
    const unlisten = listen('prepare-capture', () => {
      loadCapture();
    });
    return () => {
      document.body.classList.remove('overlay-mode');
      unlisten.then((fn) => fn());
    };
  }, [loadCapture]);

  const cancel = useCallback(() => {
    invoke('cancel_region_capture').catch(console.error);
  }, []);

  // ESC 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  const finish = useCallback(async (r: Rect) => {
    try {
      const settings = getSettings();
      await invoke('finish_region_capture', {
        game: settings.currentGame,
        server: settings.currentServer,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
      });
      // 成功后窗口由 Rust 侧关闭
    } catch (e) {
      setError(String(e));
      startRef.current = null;
      setDragRect(null);
    }
  }, []);

  /** 命中检测：返回包含点的最顶层窗口（windows 按 z-order 排列） */
  const hitTest = useCallback((x: number, y: number): WindowRectInfo | null => {
    for (const w of windowsRef.current) {
      if (x >= w.x && x < w.x + w.width && y >= w.y && y < w.y + w.height) {
        return w;
      }
    }
    return null;
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      cancel();
      return;
    }
    if (e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragRect(null);
    setError('');
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (startRef.current) {
      // 拖拽中：画自定义选区
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      const w = Math.abs(e.clientX - sx);
      const h = Math.abs(e.clientY - sy);
      if (w >= MIN_DRAG || h >= MIN_DRAG) {
        setDragRect({
          x: Math.max(0, Math.min(sx, e.clientX)),
          y: Math.max(0, Math.min(sy, e.clientY)),
          w,
          h,
        });
      }
    } else {
      // 未拖拽：检测鼠标所在窗口
      setHover(hitTest(e.clientX, e.clientY));
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const wasDragging = dragRect && dragRect.w >= MIN_DRAG && dragRect.h >= MIN_DRAG;
    startRef.current = null;

    if (wasDragging) {
      // 拖拽完成：按自定义选区截图
      finish(dragRect);
    } else {
      // 单击：按鼠标所在窗口截图
      const target = hitTest(e.clientX, e.clientY) || hover;
      if (target) {
        finish({ x: target.x, y: target.y, w: target.width, h: target.height });
      }
    }
    setDragRect(null);
  };

  // 当前高亮区域：拖拽选区优先，否则悬停窗口
  const highlight: (Rect & { label: string; dashed: boolean }) | null = dragRect
    ? { ...dragRect, label: `${Math.round(dragRect.w)} × ${Math.round(dragRect.h)}`, dashed: false }
    : hover
      ? {
          x: hover.x,
          y: hover.y,
          w: hover.width,
          h: hover.height,
          label: `${hover.title || '窗口'} · ${Math.round(hover.width)} × ${Math.round(hover.height)}`,
          dashed: true,
        }
      : null;

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 全屏截图背景 */}
      {capture && (
        <img
          src={`data:image/png;base64,${capture.base64}`}
          className="absolute inset-0 w-full h-full pointer-events-none"
          draggable={false}
          alt=""
        />
      )}

      {/* 无高亮时全屏半透明遮罩 */}
      {!highlight && <div className="absolute inset-0 bg-black/40 pointer-events-none" />}

      {/* 高亮区域（悬停窗口或拖拽选区，用 box-shadow 挖空） */}
      {highlight && (
        <div
          className={`absolute pointer-events-none ${
            highlight.dashed ? 'border-2 border-dashed border-info' : 'border-2 border-primary-500'
          }`}
          style={{
            left: highlight.x,
            top: highlight.y,
            width: highlight.w,
            height: highlight.h,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            className={`absolute -top-7 left-0 px-2 py-0.5 text-white text-xs rounded whitespace-nowrap max-w-md overflow-hidden text-ellipsis ${
              highlight.dashed ? 'bg-info' : 'bg-primary-600'
            }`}
          >
            {highlight.label}
          </div>
        </div>
      )}

      {/* 顶部操作提示 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 text-white text-sm rounded-lg pointer-events-none whitespace-nowrap">
        单击截取窗口 · 拖拽框选区域 · 右键 / ESC 取消
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-danger text-white text-sm rounded-lg pointer-events-none">
          {error}
        </div>
      )}
    </div>
  );
}
