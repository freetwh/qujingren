import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Navbar } from './components/Navbar';
import { Card } from './components/ui/Card';
import { Dashboard } from './pages/Dashboard';
import { SettingsPage } from './pages/SettingsPage';
import { RegionSelector } from './pages/RegionSelector';
import { DataWidget } from './pages/DataWidget';
import { Toast, useToast } from './components/ui/Toast';
import { getSettings, saveSettings } from './services/settings';
import { recognizeText, recognizeTextLocal } from './services/ocr';
import { parseCommoditiesByRules } from './services/ruleParser';
import { toLocalDateString } from './services/date';
import {
  hideWidget,
  isWidgetVisible,
  pushWidgetRecords,
  syncWidgetRecords,
  reloadWidget,
  setWidgetRecognizing,
  showWidget,
} from './services/widget';
import { addRecord, deleteRecord, deleteRecordsForScreenshot, getAllRecords, hasRecordsForScreenshot, renameRecords } from './db';
import type { Server, ScreenshotResult, CaptureEvent, CommodityRecord } from './types';

/** 顶层路由：框选覆盖层 / 悬浮挂件 / 主应用 */
function App() {
  const overlay = new URLSearchParams(window.location.search).get('overlay');

  if (overlay === 'region') {
    return <RegionSelector />;
  }
  if (overlay === 'widget') {
    return <DataWidget />;
  }
  return <MainApp />;
}

function MainApp() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'settings'>('dashboard');
  const initialSettings = getSettings();
  const [servers, setServers] = useState<Server[]>(
    initialSettings.servers && initialSettings.servers.length > 0
      ? initialSettings.servers
      : [{ id: '1', name: '默认区服', isDefault: true }]
  );
  const [capturing, setCapturing] = useState(false);
  const [lastOcrText, setLastOcrText] = useState('');
  const [lastOcrPath, setLastOcrPath] = useState('');
  const [ocrCopied, setOcrCopied] = useState(false);
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const [widgetOn, setWidgetOn] = useState(false);
  const { toasts, show, remove } = useToast();
  const settingsRef = useRef(initialSettings);

  // 初始化
  useEffect(() => {
    const settings = getSettings();
    settingsRef.current = settings;

    // 监听快捷键事件
    const unlistenShortcut = listen<CaptureEvent>('shortcut-capture', async () => {
      await handleCapture();
    });

    // 监听快捷键注册失败事件（热键被其他软件占用）
    const unlistenShortcutFailed = listen<CaptureEvent>('shortcut-register-failed', (event) => {
      show(event.payload.message, 'error');
    });

    // 挂件删除行 / 设置页清空数据后，刷新主看板列表
    const unlistenWidgetReload = listen('widget-reload', () => {
      setDashboardVersion((version) => version + 1);
    });

    return () => {
      unlistenShortcut.then((fn) => fn());
      unlistenShortcutFailed.then((fn) => fn());
      unlistenWidgetReload.then((fn) => fn());
    };
  }, []);

  // 触发框选截图（快捷键或手动按钮）
  const handleCapture = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);

    try {
      // 截全屏并打开框选覆盖层，后续由用户框选完成
      await invoke('start_region_capture');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('启动框选截图失败:', message);
      show(`截图失败: ${message}`, 'error');
    } finally {
      setCapturing(false);
    }
  }, [capturing, show]);

  const parseAndSave = useCallback(
    async (ocrText: string, screenshotPath: string, replaceExisting = false) => {
      const commodities = parseCommoditiesByRules(ocrText);
      console.log('[RULE] 解析结果:', commodities);

      if (commodities.length === 0) {
        show('OCR 已完成，但没有匹配到完整的商品名和单价', 'warning');
        return;
      }

      if (await hasRecordsForScreenshot(screenshotPath)) {
        if (!replaceExisting) {
          show('这张截图已经入库，无需重复解析', 'info');
          return;
        }
        await deleteRecordsForScreenshot(screenshotPath);
      }

      const settings = getSettings();
      const today = toLocalDateString();
      const savedRecords: CommodityRecord[] = [];

      for (const commodity of commodities) {
        const payload = {
          category: commodity.category,
          name: commodity.name,
          seller: commodity.seller,
          price: commodity.price,
          quantity: commodity.quantity,
          level: commodity.level ?? null,
          server: settings.currentServer,
          date: today,
          screenshotPath,
          rawText: ocrText,
        };
        savedRecords.push(await addRecord(payload));
      }

      setDashboardVersion((version) => version + 1);

      // 最新记录排在最前，挂件按同样顺序插到顶部并高亮；
      // 同时广播全量重载，避免增量推送因窗口状态/时序丢失导致挂件不刷新。
      pushWidgetRecords([...savedRecords].reverse()).catch(console.error);
      getAllRecords()
        .then(syncWidgetRecords)
        .catch((err) => console.error('推送挂件全量数据失败:', err));
    },
    [show]
  );

  // 框选完成后的 OCR + 解析 + 入库流程
  const processScreenshot = useCallback(
    async (result: ScreenshotResult) => {
      const settings = getSettings();
      setLastOcrText('');
      setLastOcrPath(result.path);
      show('截图成功，正在识别...', 'info');
      // 通知挂件进入「识别中」状态
      setWidgetRecognizing(true).catch(console.error);

      try {
        // OCR 识别：根据设置选择本地引擎或百度 API
        let ocrText: string;
        if (settings.ocrProvider === 'local') {
          ocrText = await recognizeTextLocal(result.path);
        } else {
          if (!settings.baiduApiKey || !settings.baiduSecretKey) {
            show('请先配置百度 OCR API Key', 'warning');
            return;
          }
          ocrText = await recognizeText(
            result.base64,
            settings.baiduApiKey,
            settings.baiduSecretKey
          );
        }

        console.log('[OCR] 引擎:', settings.ocrProvider, '图片:', result.path);
        console.log('[OCR] 识别文本:\n' + ocrText);
        setLastOcrText(ocrText);

        if (!ocrText.trim()) {
          show('OCR 未识别到文字', 'warning');
          return;
        }

        await parseAndSave(ocrText, result.path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('截图识别失败:', message);
        show(`识别失败: ${message}`, 'error');
      } finally {
        // 无论成功失败都结束「识别中」状态
        setWidgetRecognizing(false).catch(console.error);
      }
    },
    [parseAndSave, show]
  );

  const reparseLastOcrText = async () => {
    try {
      await parseAndSave(lastOcrText, lastOcrPath, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('重新解析 OCR 失败:', message);
      show(`重新解析失败: ${message}`, 'error');
    }
  };

  const importOcrFromClipboard = async () => {
    try {
      const ocrText = await navigator.clipboard.readText();
      if (!ocrText.trim()) {
        show('剪贴板中没有 OCR 文字', 'warning');
        return;
      }

      let hash = 0;
      for (const char of ocrText) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0;
      }
      const clipboardPath = `clipboard://ocr-${Math.abs(hash)}`;
      setLastOcrText(ocrText);
      setLastOcrPath(clipboardPath);
      await parseAndSave(ocrText, clipboardPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      show(`读取剪贴板失败: ${message}`, 'error');
    }
  };

  const copyOcrText = async () => {
    try {
      await navigator.clipboard.writeText(lastOcrText);
      setOcrCopied(true);
      window.setTimeout(() => setOcrCopied(false), 1500);
    } catch {
      show('OCR 文字复制失败', 'error');
    }
  };

  // 监听框选完成/取消事件
  useEffect(() => {
    const unlistenCaptured = listen<ScreenshotResult>('region-captured', (event) => {
      processScreenshot(event.payload);
    });
    const unlistenCancelled = listen('region-cancelled', () => {
      show('已取消截图', 'info');
    });

    return () => {
      unlistenCaptured.then((fn) => fn());
      unlistenCancelled.then((fn) => fn());
    };
  }, [processScreenshot, show]);

  // 挂件默认由 Rust 端在启动时预创建并直接显示（见 lib.rs setup）。
  // 这里只读取真实可见性来同步主窗口开关，绝不主动 showWidget ——
  // 否则会和预创建窗口叠加出「两个悬浮窗 / 关不掉」的现象。
  useEffect(() => {
    isWidgetVisible()
      .then(setWidgetOn)
      .catch(() => setWidgetOn(false));

    const unlistenVisibility = listen<boolean>('widget-visibility', (event) => {
      setWidgetOn(event.payload);
    });

    // 挂件挂载/刷新时向主窗口请求全量数据。
    // 关键：Tauri 多 webview 不共享 IndexedDB，挂件自己的库是空的，
    // 必须让持有真实数据的主窗口把全量推过去，数据才能实时进入挂件列表。
    const unlistenSync = listen('widget-request-sync', async () => {
      try {
        const all = await getAllRecords();
        await syncWidgetRecords(all);
      } catch (err) {
        console.error('推送挂件全量数据失败:', err);
      }
    });

    // 监听器注册完成后主动推一次全量数据：
    // 挂件的首次同步请求可能在本监听器注册前发出而丢失，主动推送可兜底
    getAllRecords()
      .then(syncWidgetRecords)
      .catch((err) => console.error('主动推送挂件数据失败:', err));

    // 挂件通知主窗口删除记录（挂件自己的 IndexedDB 是空的，无法直接删）
    const unlistenDelete = listen<number>('widget-delete-record', async (event) => {
      try {
        await deleteRecord(event.payload);
        const all = await getAllRecords();
        await syncWidgetRecords(all);
      } catch (err) {
        console.error('主窗口删除记录失败:', err);
      }
    });

    // 挂件通知主窗口重命名记录
    const unlistenRename = listen<{ category: string; oldName: string; server: string; newName: string }>(
      'widget-rename-record',
      async (event) => {
        try {
          const { category, oldName, server, newName } = event.payload;
          await renameRecords(category, oldName, server, newName);
          const all = await getAllRecords();
          await syncWidgetRecords(all);
        } catch (err) {
          console.error('主窗口重命名记录失败:', err);
        }
      }
    );

    return () => {
      unlistenVisibility.then((fn) => fn());
      unlistenSync.then((fn) => fn());
      unlistenDelete.then((fn) => fn());
      unlistenRename.then((fn) => fn());
    };
  }, []);

  const toggleWidget = useCallback(async () => {
    try {
      if (widgetOn) {
        await hideWidget();
        setWidgetOn(false);
      } else {
        await showWidget();
        setWidgetOn(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      show(`挂件操作失败: ${message}`, 'error');
    }
  }, [widgetOn, show]);

  // 区服管理：选择/新增/删除均持久化到设置，OCR 入库时按 currentServer 归属
  const handleServerSelect = useCallback((name: string) => {
    saveSettings({ currentServer: name });
    settingsRef.current = getSettings();
  }, []);

  const handleServerAdd = useCallback((name: string) => {
    const newServer: Server = {
      id: Date.now().toString(),
      name,
      isDefault: false,
    };
    setServers((prev) => {
      const next = [...prev, newServer];
      saveSettings({ servers: next, currentServer: name });
      settingsRef.current = getSettings();
      return next;
    });
  }, []);

  const handleServerDelete = useCallback((id: string) => {
    setServers((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;
      const next = prev.filter((s) => s.id !== id);
      const fallback = next[0]?.name ?? '默认区服';
      // 删掉的是当前区服时，回退到列表首个（或默认），保证 OCR 始终有归属
      const current = settingsRef.current.currentServer;
      const nextCurrent = current === target.name ? fallback : current;
      saveSettings({ servers: next, currentServer: nextCurrent });
      settingsRef.current = getSettings();
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        servers={servers}
        currentServer={settingsRef.current.currentServer}
        onServerSelect={handleServerSelect}
        onServerAdd={handleServerAdd}
        onServerDelete={handleServerDelete}
        onManualCapture={handleCapture}
        capturing={capturing}
        shortcut={settingsRef.current.shortcut}
        widgetOn={widgetOn}
        onToggleWidget={toggleWidget}
      />

      <main className="pt-14 p-6">
        {currentPage === 'dashboard' && (
          <div className="mb-3 flex justify-end">
            <button
              onClick={importOcrFromClipboard}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary cursor-pointer"
            >
              从剪贴板解析 OCR 原文
            </button>
          </div>
        )}
        {currentPage === 'dashboard' ? (
          <Dashboard key={dashboardVersion} />
        ) : (
          <SettingsPage />
        )}

        {lastOcrText && (
          <Card title="最近一次 OCR 原文" className="max-w-4xl mx-auto mt-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs text-text-muted truncate" title={lastOcrPath}>
                图片：{lastOcrPath}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={reparseLastOcrText}
                  className="px-3 py-1.5 rounded-lg bg-success/20 text-success text-xs hover:bg-success/30 transition-colors cursor-pointer"
                >
                  重新解析并入库
                </button>
                <button
                  onClick={copyOcrText}
                  className="px-3 py-1.5 rounded-lg bg-primary-600/80 text-white text-xs hover:bg-primary-500 transition-colors cursor-pointer"
                >
                  {ocrCopied ? '已复制' : '复制文字'}
                </button>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-4 text-sm leading-6 text-text-primary">
              {lastOcrText}
            </pre>
          </Card>
        )}
      </main>

      {/* Toast 通知 */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => remove(toast.id)}
        />
      ))}
    </div>
  );
}

export default App;
