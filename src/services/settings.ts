import type { AppSettings } from '../types';
import { getEnvironmentSettings } from './env';

const SETTINGS_KEY = 'mhxy_commodity_settings';

const DEFAULT_SETTINGS: AppSettings = {
  ocrProvider: 'baidu',
  baiduApiKey: '',
  baiduSecretKey: '',
  aiOptimizationEnabled: false,
  aiProvider: 'kimi',
  kimiApiKey: '',
  kimiModel: 'moonshot-v1-8k',
  deepseekApiKey: '',
  deepseekModel: 'deepseek-chat',
  qwenApiKey: '',
  qwenModel: 'qwen-plus',
  numberDisplayFormat: 'chinese-unit',
  shortcut: 'Ctrl+Shift+S',
  currentServer: '',
  currentGame: '梦幻西游',
};

/** 获取设置 */
export function getSettings(): AppSettings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  const parsed = stored ? JSON.parse(stored) : {};
  const saved = parsed && typeof parsed === 'object' ? parsed : {};

  // 兼容旧版「AI 整理」开关；已有 Kimi Key/模型可直接沿用。
  if ('aiRefine' in saved) {
    if (!('aiOptimizationEnabled' in saved)) {
      saved.aiOptimizationEnabled = Boolean(saved.aiRefine);
    }
    delete saved.aiRefine;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
  }

  // 非敏感环境变量只提供初始值，设置页保存的选择优先；API 密钥只允许从本机设置读取。
  return { ...DEFAULT_SETTINGS, ...getEnvironmentSettings(), ...saved };
}

/** 保存设置 */
export function saveSettings(settings: Partial<AppSettings>) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
}

/** 获取默认设置 */
export function getDefaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS };
}
