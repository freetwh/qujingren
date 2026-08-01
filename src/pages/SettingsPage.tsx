import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Key,
  Cloud,
  Download,
  Trash2,
  Keyboard,
  FolderOpen,
  Copy,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { getSettings, saveSettings } from '../services/settings';
import { testConnection } from '../services/supabase';
import { clearAllData, exportAllData } from '../db';
import type { AppSettings } from '../types';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [screenshotDir, setScreenshotDir] = useState<string>('');
  const [logDir, setLogDir] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [openDirMsg, setOpenDirMsg] = useState<string>('');

  useEffect(() => {
    setSettings(getSettings());
    invoke<string>('get_screenshot_dir')
      .then(setScreenshotDir)
      .catch((e) => setScreenshotDir(`获取失败: ${e}`));
    invoke<string>('get_log_dir')
      .then(setLogDir)
      .catch((e) => setLogDir(`获取失败: ${e}`));
  }, []);

  const handleOpenDir = async (cmd: 'open_screenshot_dir' | 'open_log_dir') => {
    setOpenDirMsg('');
    try {
      await invoke(cmd);
    } catch (e) {
      setOpenDirMsg(`打开失败: ${e}`);
    }
  };

  const handleCopyPath = async (path: string, key: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1500);
    } catch {
      setOpenDirMsg('复制失败');
    }
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings({ [key]: value });
  };

  const toggleShowKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTestSupabase = async () => {
    if (!settings.supabaseUrl || !settings.supabaseKey) {
      setTestResult('请先填写 Supabase URL 和 Key');
      return;
    }
    setTesting(true);
    setTestResult('');
    const ok = await testConnection(settings.supabaseUrl, settings.supabaseKey);
    setTestResult(ok ? '连接成功！' : '连接失败，请检查配置');
    setTesting(false);
  };

  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mhxy-commodity-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearData = async () => {
    if (window.confirm('确定要清除所有本地数据吗？此操作不可恢复。')) {
      await clearAllData();
      window.location.reload();
    }
  };

  const renderKeyInput = (
    label: string,
    key: keyof AppSettings,
    placeholder: string
  ) => {
    const visible = showKeys[key] || false;
    return (
      <div>
        <label className="block text-sm text-text-secondary mb-1.5">{label}</label>
        <div className="relative">
          <input
            type={visible ? 'text' : 'password'}
            value={String(settings[key] || '')}
            onChange={(e) => updateSetting(key, e.target.value as AppSettings[typeof key])}
            placeholder={placeholder}
            className="w-full px-3 py-2 pr-10 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
          />
          <button
            onClick={() => toggleShowKey(key)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* API 配置 */}
      <Card title="API 配置">
        <div className="space-y-4">
          {/* OCR 引擎选择 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">OCR 识别引擎</label>
            <div className="flex gap-2">
              <button
                onClick={() => updateSetting('ocrProvider', 'local')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  settings.ocrProvider === 'local'
                    ? 'bg-primary-600 text-white neon-glow-sm'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                本地识别（推荐）
              </button>
              <button
                onClick={() => updateSetting('ocrProvider', 'baidu')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  settings.ocrProvider === 'baidu'
                    ? 'bg-primary-600 text-white neon-glow-sm'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                百度 OCR API
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {settings.ocrProvider === 'local'
                ? 'Windows.Media.Ocr 系统自带：免费、离线、无需配置'
                : '百度 OCR 免费额度：每天 500 次通用文字识别'}
            </p>
          </div>

          {settings.ocrProvider === 'baidu' && (
            <>
              {renderKeyInput('百度 OCR API Key', 'baiduApiKey', '输入百度智能云 API Key')}
              {renderKeyInput('百度 OCR Secret Key', 'baiduSecretKey', '输入百度智能云 Secret Key')}
            </>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">大模型提供商</label>
            <div className="flex gap-2">
              {(['deepseek', 'qwen'] as const).map((provider) => (
                <button
                  key={provider}
                  onClick={() => updateSetting('llmProvider', provider)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    settings.llmProvider === provider
                      ? 'bg-primary-600 text-white neon-glow-sm'
                      : 'bg-white/5 text-text-secondary hover:bg-white/10'
                  }`}
                >
                  {provider === 'deepseek' ? 'DeepSeek' : '通义千问'}
                </button>
              ))}
            </div>
          </div>

          {renderKeyInput(
            `${settings.llmProvider === 'deepseek' ? 'DeepSeek' : '通义千问'} API Key`,
            'llmApiKey',
            '输入大模型 API Key'
          )}
        </div>
      </Card>

      {/* Supabase 配置 */}
      <Card title="Supabase 云数据库">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Supabase URL</label>
            <input
              type="text"
              value={settings.supabaseUrl}
              onChange={(e) => updateSetting('supabaseUrl', e.target.value)}
              placeholder="https://your-project.supabase.co"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
            />
          </div>

          {renderKeyInput('Supabase Anon Key', 'supabaseKey', '输入 Supabase Anon Key')}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud size={16} className="text-text-secondary" />
              <span className="text-sm text-text-secondary">自动上报</span>
            </div>
            <button
              onClick={() => updateSetting('autoUpload', !settings.autoUpload)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
                settings.autoUpload ? 'bg-primary-600' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.autoUpload ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestSupabase}
              disabled={testing}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 transition-colors cursor-pointer disabled:opacity-50"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            {testResult && (
              <span
                className={`text-sm ${
                  testResult.includes('成功') ? 'text-success' : 'text-danger'
                }`}
              >
                {testResult}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* 快捷键设置 */}
      <Card title="快捷键设置">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Keyboard size={16} className="text-text-secondary" />
            <div className="flex-1">
              <div className="text-sm text-text-secondary mb-1">截图快捷键</div>
              <input
                type="text"
                value={settings.shortcut}
                onChange={(e) => updateSetting('shortcut', e.target.value)}
                placeholder="Ctrl+Shift+S"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
              />
            </div>
          </div>
          <p className="text-xs text-text-muted">
            格式：Ctrl+Shift+字母，例如 Ctrl+Shift+S。修改后需重启应用生效。
          </p>
        </div>
      </Card>

      {/* 存储目录 */}
      <Card title="存储目录">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">截图目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={screenshotDir}
                readOnly
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary outline-none select-all"
              />
              <button
                onClick={() => handleCopyPath(screenshotDir, 'screenshot')}
                className="px-3 py-2 bg-white/5 text-text-secondary rounded-lg text-sm hover:bg-white/10 transition-colors cursor-pointer"
                title="复制路径"
              >
                {copiedKey === 'screenshot' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => handleOpenDir('open_screenshot_dir')}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 transition-colors cursor-pointer"
              >
                <FolderOpen size={14} />
                打开
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              截图按「游戏名/区服」子目录分类存放，文件名格式为 年月日_时分秒.png
            </p>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">日志目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={logDir}
                readOnly
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary outline-none select-all"
              />
              <button
                onClick={() => handleCopyPath(logDir, 'log')}
                className="px-3 py-2 bg-white/5 text-text-secondary rounded-lg text-sm hover:bg-white/10 transition-colors cursor-pointer"
                title="复制路径"
              >
                {copiedKey === 'log' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => handleOpenDir('open_log_dir')}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 transition-colors cursor-pointer"
              >
                <FolderOpen size={14} />
                打开
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              运行日志（含 OCR 识别文本记录），仅开发模式输出
            </p>
          </div>

          {openDirMsg && <p className="text-xs text-danger">{openDirMsg}</p>}
        </div>
      </Card>

      {/* 数据管理 */}
      <Card title="数据管理">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-info/20 text-info rounded-lg text-sm hover:bg-info/30 transition-colors cursor-pointer"
            >
              <Download size={14} />
              导出数据 (JSON)
            </button>
            <button
              onClick={handleClearData}
              className="flex items-center gap-2 px-4 py-2 bg-danger/20 text-danger rounded-lg text-sm hover:bg-danger/30 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              清除所有数据
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
