import type { AppSettings } from '../types';
import { getEnvironmentSettings } from './env';

const SETTINGS_KEY = 'mhxy_commodity_settings';

const DEFAULT_SETTINGS: AppSettings = {
  ocrProvider: 'local',
  baiduApiKey: '',
  baiduSecretKey: '',
  aiRefine: false,
  kimiApiKey: '',
  kimiModel: 'moonshot-v1-8k',
  shortcut: 'Ctrl+Shift+S',
  currentServer: '默认区服',
  currentGame: '梦幻西游',
};

/** 获取设置 */
export function getSettings(): AppSettings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  const saved = stored ? JSON.parse(stored) : {};

  // 环境变量优先，适合开发/部署时统一配置；设置页仍可作为本地兜底。
  return { ...DEFAULT_SETTINGS, ...saved, ...getEnvironmentSettings() };
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
