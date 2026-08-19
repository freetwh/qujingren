import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const secretNames = new Set([
  'VITE_BAIDU_OCR_API_KEY',
  'VITE_BAIDU_API_KEY',
  'VITE_BAIDU_OCR_SECRET_KEY',
  'VITE_BAIDU_SECRET_KEY',
  'VITE_KIMI_API_KEY',
  'VITE_MOONSHOT_API_KEY',
  'VITE_DEEPSEEK_API_KEY',
  'VITE_QWEN_API_KEY',
  'VITE_DASHSCOPE_API_KEY',
  'VITE_LLM_API_KEY',
]);

function readConfiguredSecrets() {
  const secrets = [];
  for (const filename of ['.env', '.env.local']) {
    if (!existsSync(filename)) continue;
    for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || !secretNames.has(match[1])) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value.length >= 8) secrets.push({ name: match[1], value });
    }
  }
  return secrets;
}

function listFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(path, entry.name);
    return entry.isDirectory() ? listFiles(childPath) : [childPath];
  });
}

const targets = (process.argv.length > 2 ? process.argv.slice(2) : ['dist']).map((path) =>
  resolve(path)
);
for (const target of targets) {
  if (!existsSync(target)) throw new Error(`未找到待检查产物：${target}`);
}

const secrets = readConfiguredSecrets();
const leaks = [];
for (const path of targets.flatMap(listFiles)) {
  const content = readFileSync(path);
  for (const secret of secrets) {
    if (content.includes(Buffer.from(secret.value))) {
      leaks.push(`${secret.name} -> ${path}`);
    }
  }
}

if (leaks.length > 0) {
  console.error('构建失败：前端产物包含本机 OCR/AI 密钥：');
  for (const leak of leaks) console.error(`- ${leak}`);
  process.exit(1);
}

console.log(
  `密钥检查通过：已扫描 ${targets.length} 个产物目标，未发现 ${secrets.length} 个本机 OCR/AI 密钥。`
);
