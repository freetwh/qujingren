import type { AppSettings } from '../types';

const SETTINGS_KEY = 'mhxy_commodity_settings';

const DEFAULT_SETTINGS: AppSettings = {
  ocrProvider: 'local',
  baiduApiKey: '',
  baiduSecretKey: '',
  llmProvider: 'deepseek',
  llmApiKey: '',
  shortcut: 'Ctrl+Shift+S',
  currentServer: '默认区服',
  currentGame: '梦幻西游',
  supabaseUrl: '',
  supabaseKey: '',
  autoUpload: true,
};

/** 获取设置 */
export function getSettings(): AppSettings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;

  return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
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
