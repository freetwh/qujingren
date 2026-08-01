import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { SettingsPage } from './pages/SettingsPage';
import { RegionSelector } from './pages/RegionSelector';
import { Toast, useToast } from './components/ui/Toast';
import { getSettings, saveSettings } from './services/settings';
import { recognizeText, recognizeTextLocal } from './services/ocr';
import { parseCommodities } from './services/llm';
import { addRecord, getRecordsByDateRange } from './db';
import { calculateGroupAverages } from './services/statistics';
import { initSupabase, uploadAverages } from './services/supabase';
import type { Server, ScreenshotResult, CaptureEvent, UploadRecord } from './types';

/** 顶层路由：框选覆盖层窗口 or 主应用 */
function App() {
  const isOverlay =
    new URLSearchParams(window.location.search).get('overlay') === 'region';

  if (isOverlay) {
    return <RegionSelector />;
  }
  return <MainApp />;
}

function MainApp() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'settings'>('dashboard');
  const [servers, setServers] = useState<Server[]>([
    { id: '1', name: '默认区服', isDefault: true },
  ]);
  const [capturing, setCapturing] = useState(false);
  const { toasts, show, remove } = useToast();
  const settingsRef = useRef(getSettings());
  const lastUploadDateRef = useRef<string>('');

  // 初始化
  useEffect(() => {
    const settings = getSettings();
    settingsRef.current = settings;

    // 初始化 Supabase
    if (settings.supabaseUrl && settings.supabaseKey) {
      initSupabase(settings.supabaseUrl, settings.supabaseKey);
    }

    // 监听快捷键事件
    const unlistenShortcut = listen<CaptureEvent>('shortcut-capture', async () => {
      await handleCapture();
    });

    // 监听快捷键注册失败事件（热键被其他软件占用）
    const unlistenShortcutFailed = listen<CaptureEvent>('shortcut-register-failed', (event) => {
      show(event.payload.message, 'error');
    });

    return () => {
      unlistenShortcut.then((fn) => fn());
      unlistenShortcutFailed.then((fn) => fn());
    };
  }, []);

  // 每日上报检查
  useEffect(() => {
    const checkUpload = async () => {
      const settings = getSettings();
      if (!settings.autoUpload || !settings.supabaseUrl || !settings.supabaseKey) return;

      const today = new Date().toISOString().split('T')[0];
      if (lastUploadDateRef.current === today) return;

      const records = await getRecordsByDateRange(today, today);
      if (records.length === 0) return;

      const averages = calculateGroupAverages(records);
      const uploadRecords: UploadRecord[] = averages.map((avg) => ({
        name: avg.name,
        server: avg.server,
        avg_price: avg.avgPrice,
        sample_count: avg.sampleCount,
        date: avg.date,
      }));

      const ok = await uploadAverages(uploadRecords);
      if (ok) {
        lastUploadDateRef.current = today;
        show(`已上报 ${uploadRecords.length} 条均价数据`, 'success');
      }
    };

    // 每小时检查一次
    const interval = setInterval(checkUpload, 3600000);
    checkUpload(); // 立即执行一次

    return () => clearInterval(interval);
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

  // 框选完成后的 OCR + 解析 + 入库流程
  const processScreenshot = useCallback(
    async (result: ScreenshotResult) => {
      const settings = getSettings();
      show('截图成功，正在识别...', 'info');

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

        if (!ocrText.trim()) {
          show('OCR 未识别到文字', 'warning');
          return;
        }

        // 大模型解析
        if (!settings.llmApiKey) {
          show('请先配置大模型 API Key', 'warning');
          return;
        }

        const commodities = await parseCommodities(
          ocrText,
          settings.llmProvider,
          settings.llmApiKey
        );

        console.log('[LLM] 解析结果:', commodities);

        if (commodities.length === 0) {
          show('未识别到商品信息', 'warning');
          return;
        }

        // 存入数据库
        const today = new Date().toISOString().split('T')[0];
        for (const commodity of commodities) {
          await addRecord({
            name: commodity.name,
            seller: commodity.seller,
            price: commodity.price,
            quantity: commodity.quantity,
            server: settings.currentServer,
            date: today,
            screenshotPath: result.path,
            rawText: ocrText,
          });
        }

        show(`成功识别 ${commodities.length} 条商品记录`, 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('截图识别失败:', message);
        show(`识别失败: ${message}`, 'error');
      }
    },
    [show]
  );

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

  // 区服管理
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
    setServers((prev) => [...prev, newServer]);
  }, []);

  const handleServerDelete = useCallback((id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
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
      />

      <main className="pt-14 p-6">
        {currentPage === 'dashboard' ? <Dashboard /> : <SettingsPage />}
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
