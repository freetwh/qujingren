import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
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
import { reloadWidget } from '../services/widget';
import { clearAllData, exportAllData } from '../db';
import type { AiProvider, AppSettings } from '../types';

const AI_PROVIDER_SETTINGS = {
  kimi: {
    label: 'Kimi（默认）',
    apiKey: 'kimiApiKey',
    model: 'kimiModel',
    keyPlaceholder: '输入 Kimi API Key（sk-...）',
    modelPlaceholder: 'moonshot-v1-8k',
  },
  deepseek: {
    label: 'DeepSeek',
    apiKey: 'deepseekApiKey',
    model: 'deepseekModel',
    keyPlaceholder: '输入 DeepSeek API Key（sk-...）',
    modelPlaceholder: 'deepseek-chat',
  },
  qwen: {
    label: 'Qwen',
    apiKey: 'qwenApiKey',
    model: 'qwenModel',
    keyPlaceholder: '输入阿里云百炼 API Key（sk-...）',
    modelPlaceholder: 'qwen-plus',
  },
} as const satisfies Record<
  AiProvider,
  {
    label: string;
    apiKey: keyof AppSettings;
    model: keyof AppSettings;
    keyPlaceholder: string;
    modelPlaceholder: string;
  }
>;

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [screenshotDir, setScreenshotDir] = useState<string>('');
  const [logDir, setLogDir] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [openDirMsg, setOpenDirMsg] = useState<string>('');

  const activeAiProvider = AI_PROVIDER_SETTINGS[settings.aiProvider];

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
    if (key === 'numberDisplayFormat') {
      reloadWidget().catch((error) => console.error('刷新悬浮窗数字格式失败:', error));
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
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
      // 挂件是独立窗口，主窗口 reload 不会带上它，需要单独通知
      await reloadWidget().catch(console.error);
      window.location.reload();
    }
  };

  const renderKeyInput = (
    label: string,
    key: keyof AppSettings,
    placeholder: string,
    locked = false
  ) => {
    const visible = showKeys[key] || false;
    return (
      <div>
        <label className="block text-sm text-text-secondary mb-1.5">
          {label}
          {locked && <span className="ml-2 text-xs text-primary-400">环境变量</span>}
        </label>
        <div className="relative">
          <input
            type={visible ? 'text' : 'password'}
            value={String(settings[key] || '')}
            onChange={(e) => updateSetting(key, e.target.value as AppSettings[typeof key])}
            placeholder={placeholder}
            disabled={locked}
            className="w-full px-3 py-2 pr-10 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
      {/* OCR 配置 */}
      <Card title="OCR 配置">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-text-muted">
            OCR 是唯一识别方式；尽量把梦幻的分辨率调大，保证识图的准确率。开启下方「AI 优化」后，只会把通过商品截图格式校验的 OCR 文本发送给所选 AI 服务进行商品名纠错和结构化优化。
          </p>
          <p className="rounded-lg border border-primary-500/20 bg-primary-600/10 px-3 py-2 text-xs leading-5 text-primary-300">
            百度 OCR 密钥仅在本机设置中保存并在调用 OCR 时使用。
          </p>
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
                本地识别
              </button>
              <button
                onClick={() => updateSetting('ocrProvider', 'baidu')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  settings.ocrProvider === 'baidu'
                    ? 'bg-primary-600 text-white neon-glow-sm'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                百度 OCR API（推荐）
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {settings.ocrProvider === 'local'
                ? 'Windows.Media.Ocr 系统自带：免费、离线、无需配置'
                : '使用百度通用文字识别（基础版，不请求文字坐标）'}
            </p>
          </div>

          {settings.ocrProvider === 'baidu' && (
            <>
              {renderKeyInput(
                '百度 OCR API Key',
                'baiduApiKey',
                '输入百度智能云 API Key'
              )}
              {renderKeyInput(
                '百度 OCR Secret Key',
                'baiduSecretKey',
                '输入百度智能云 Secret Key'
              )}
            </>
          )}

        </div>
      </Card>

      {/* AI 优化 */}
      <Card title="AI 优化">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-text-muted">
            默认使用 Kimi，也可选择 DeepSeek 或 Qwen。AI 调用失败或没有返回有效商品时，会自动回退到本地固定规则解析。
          </p>
          <p className="rounded-lg border border-primary-500/20 bg-primary-600/10 px-3 py-2 text-xs leading-5 text-primary-300">
            所有 AI API Key 均可在这里编辑并仅保存在本机，不从构建环境变量读取，也不会写入安装包。
          </p>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">AI 优化开关</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateSetting('aiOptimizationEnabled', false)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  !settings.aiOptimizationEnabled
                    ? 'bg-primary-600 text-white neon-glow-sm'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                关闭（默认）
              </button>
              <button
                type="button"
                onClick={() => updateSetting('aiOptimizationEnabled', true)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  settings.aiOptimizationEnabled
                    ? 'bg-primary-600 text-white neon-glow-sm'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                开启
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">AI 供应商</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(AI_PROVIDER_SETTINGS) as AiProvider[]).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => updateSetting('aiProvider', provider)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    settings.aiProvider === provider
                      ? 'bg-primary-600 text-white neon-glow-sm'
                      : 'bg-white/5 text-text-secondary hover:bg-white/10'
                  }`}
                >
                  {AI_PROVIDER_SETTINGS[provider].label}
                </button>
              ))}
            </div>
          </div>

          {renderKeyInput(
            `${activeAiProvider.label.replace('（默认）', '')} API Key`,
            activeAiProvider.apiKey,
            activeAiProvider.keyPlaceholder
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">模型</label>
            <input
              type="text"
              value={String(settings[activeAiProvider.model] || '')}
              onChange={(e) => updateSetting(activeAiProvider.model, e.target.value)}
              placeholder={activeAiProvider.modelPlaceholder}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>
      </Card>

      {/* 数字展示 */}
      <Card title="数字展示">
        <div className="space-y-3">
          <label className="block text-sm text-text-secondary">价格与均价</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateSetting('numberDisplayFormat', 'chinese-unit')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                settings.numberDisplayFormat === 'chinese-unit'
                  ? 'bg-primary-600 text-white neon-glow-sm'
                  : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            >
              中文单位（默认）
            </button>
            <button
              type="button"
              onClick={() => updateSetting('numberDisplayFormat', 'comma')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                settings.numberDisplayFormat === 'comma'
                  ? 'bg-primary-600 text-white neon-glow-sm'
                  : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            >
              逗号分隔
            </button>
          </div>
          <p className="text-xs text-text-muted">
            中文单位示例：1 亿 2345.68 万；逗号分隔示例：123,456,789。
          </p>
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
