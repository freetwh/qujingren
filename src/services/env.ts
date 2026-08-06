import type { AppSettings } from '../types';

type EnvKey =
  | 'VITE_OCR_PROVIDER'
  | 'VITE_BAIDU_OCR_API_KEY'
  | 'VITE_BAIDU_API_KEY'
  | 'VITE_BAIDU_OCR_SECRET_KEY'
  | 'VITE_BAIDU_SECRET_KEY';

// 必须显式访问每个变量名。Vite 只会可靠地替换静态的 import.meta.env.VITE_* 访问。
const RAW_ENV: Record<EnvKey, string | undefined> = {
  VITE_OCR_PROVIDER: import.meta.env.VITE_OCR_PROVIDER,
  VITE_BAIDU_OCR_API_KEY: import.meta.env.VITE_BAIDU_OCR_API_KEY,
  VITE_BAIDU_API_KEY: import.meta.env.VITE_BAIDU_API_KEY,
  VITE_BAIDU_OCR_SECRET_KEY: import.meta.env.VITE_BAIDU_OCR_SECRET_KEY,
  VITE_BAIDU_SECRET_KEY: import.meta.env.VITE_BAIDU_SECRET_KEY,
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

  const baiduApiKey = readEnv('VITE_BAIDU_OCR_API_KEY', 'VITE_BAIDU_API_KEY');
  const baiduSecretKey = readEnv(
    'VITE_BAIDU_OCR_SECRET_KEY',
    'VITE_BAIDU_SECRET_KEY'
  );
  if (baiduApiKey) overrides.baiduApiKey = baiduApiKey;
  if (baiduSecretKey) overrides.baiduSecretKey = baiduSecretKey;

  return overrides;
}

/** 判断某个 API 是否由环境变量提供，供请求层选择环境变量里的附加配置。 */
export function hasEnvironmentValue(key: EnvKey): boolean {
  return Boolean(readEnv(key));
}
