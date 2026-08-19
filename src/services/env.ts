import type { AppSettings } from '../types';

type EnvKey =
  | 'VITE_OCR_PROVIDER'
  | 'VITE_REMOTE_API_URL'
  | 'VITE_SUPABASE_URL';

// 必须显式访问每个变量名。Vite 只会可靠地替换静态的 import.meta.env.VITE_* 访问。
const RAW_ENV: Record<EnvKey, string | undefined> = {
  VITE_OCR_PROVIDER: import.meta.env.VITE_OCR_PROVIDER,
  VITE_REMOTE_API_URL: import.meta.env.VITE_REMOTE_API_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
};

function readEnv(...keys: EnvKey[]): string {
  for (const key of keys) {
    const value = RAW_ENV[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

const envOcrProvider = readEnv('VITE_OCR_PROVIDER');

/** 构建时环境变量。没有配置时返回空对象，由设置页配置接管。 */
export function getEnvironmentSettings(): Partial<AppSettings> {
  const overrides: Partial<AppSettings> = {};

  if (envOcrProvider === 'local' || envOcrProvider === 'baidu') {
    overrides.ocrProvider = envOcrProvider;
  }

  return overrides;
}

/** 判断某个 API 是否由环境变量提供，供请求层选择环境变量里的附加配置。 */
export function hasEnvironmentValue(key: EnvKey): boolean {
  return Boolean(readEnv(key));
}

export function getRemoteApiConfig() {
  const explicitUrl = readEnv('VITE_REMOTE_API_URL').replace(/\/+$/, '');
  const supabaseUrl = readEnv('VITE_SUPABASE_URL').replace(/\/+$/, '');
  return {
    url: explicitUrl || (supabaseUrl ? `${supabaseUrl}/functions/v1/commodity-api` : ''),
  };
}
