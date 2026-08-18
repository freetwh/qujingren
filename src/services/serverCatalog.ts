import type {
  ServerCatalog,
  ServerRegion,
  ServerSelection,
  ServerType,
  ServerTypeId,
} from '../types';
import { SERVER_CATALOG_SNAPSHOT } from '../data/serverCatalogSnapshot';
import { getAccessHeaders } from './access';
import { getRemoteApiConfig } from './env';

// v1 快照曾受 Windows 输出编码影响，换 key 可立即绕过已落盘的损坏缓存。
const CACHE_KEY = 'mhxy_server_catalog_v2';
const EXPECTED_TYPE_NAMES: Record<ServerTypeId, string> = {
  time: '时间服',
  free: '畅玩服',
};
const OFFICIAL_SOURCES = [
  {
    id: 'time' as const,
    name: '时间服',
    url: 'https://cbg-xyq.res.netease.com/js/server_list_data.js',
    variable: 'server_data',
    minimumRegions: 50,
    minimumServers: 250,
  },
  {
    id: 'free' as const,
    name: '畅玩服',
    url: 'https://cbg-xyq.res.netease.com/js/xyqs_server_list_data.js',
    variable: 'xyqs_server_data',
    minimumRegions: 1,
    minimumServers: 20,
  },
];

type OfficialRegion = [
  [string, string, string | number, ...unknown[]],
  Array<[string | number, string, ...unknown[]]>,
];

function isCatalog(value: unknown): value is ServerCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ServerCatalog>;
  if (
    !Array.isArray(candidate.types) ||
    candidate.types.length !== 2 ||
    typeof candidate.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return false;
  }

  const ids = new Set(candidate.types.map((type) => type.id));
  return (
    ids.has('time') &&
    ids.has('free') &&
    candidate.types.every(
      (type) =>
        (type.id === 'time' || type.id === 'free') &&
        type.name === EXPECTED_TYPE_NAMES[type.id] &&
        Array.isArray(type.regions) &&
        type.regions.length > 0 &&
        type.regions.every(
          (region) =>
            isUsableLabel(region.id) &&
            isUsableLabel(region.name) &&
            Array.isArray(region.servers) &&
            region.servers.length > 0 &&
            region.servers.every((server) => isUsableLabel(server.id) && isUsableLabel(server.name))
        )
    )
  );
}

function isUsableLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[?？\uFFFD]/.test(value);
}

function parseOfficialScript(
  script: string,
  variable: string,
  id: ServerTypeId,
  name: string
): ServerType {
  const prefix = new RegExp(`(?:var\\s+)?${variable}\\s*=\\s*`);
  const match = prefix.exec(script);
  if (!match) throw new Error(`官方区服数据缺少 ${variable}`);

  const jsonStart = match.index + match[0].length;
  const jsonEnd = script.lastIndexOf(';');
  const raw = script.slice(jsonStart, jsonEnd > jsonStart ? jsonEnd : undefined).trim();
  const data = JSON.parse(raw) as Record<string, OfficialRegion>;
  const regions: ServerRegion[] = Object.entries(data).map(([fallbackId, entry]) => {
    const [region, servers] = entry;
    return {
      id: String(region[2] ?? fallbackId),
      name: String(region[0]),
      servers: servers.map((server) => ({ id: String(server[0]), name: String(server[1]) })),
    };
  });

  return { id, name, regions };
}

async function fetchOfficialCatalog(): Promise<ServerCatalog> {
  const types = await Promise.all(
    OFFICIAL_SOURCES.map(async (source) => {
      const response = await fetch(source.url, {
        cache: 'no-cache',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`官方区服接口返回 ${response.status}`);
      const type = parseOfficialScript(
        await response.text(),
        source.variable,
        source.id,
        source.name
      );
      const serverCount = type.regions.reduce((count, region) => count + region.servers.length, 0);
      if (type.regions.length < source.minimumRegions || serverCount < source.minimumServers) {
        throw new Error(
          `官方区服数据不完整：${type.regions.length} 个大区 / ${serverCount} 个小区`
        );
      }
      return type;
    })
  );

  return {
    types,
    source: '网易藏宝阁公开区服数据',
    updatedAt: new Date().toISOString(),
  };
}

function readCachedCatalog(): ServerCatalog | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return isCatalog(value) ? value : null;
  } catch {
    return null;
  }
}

function cacheCatalog(catalog: ServerCatalog) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch (error) {
    // 禁用/写满 localStorage 不应让已经成功取得的在线目录失效。
    console.warn('区服目录缓存失败:', error);
  }
}

/** 优先级：自有接口 → 网易公开数据 → 最近缓存 → 内置完整快照。 */
export async function loadServerCatalog(): Promise<ServerCatalog> {
  const { url } = getRemoteApiConfig();
  const errors: string[] = [];

  if (url) {
    try {
      const response = await fetch(`${url}/servers`, {
        headers: await getAccessHeaders(),
      });
      if (!response.ok) throw new Error(`区服接口返回 ${response.status}`);
      const catalog: unknown = await response.json();
      if (!isCatalog(catalog)) throw new Error('区服接口数据格式不正确');
      cacheCatalog(catalog);
      return catalog;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const catalog = await fetchOfficialCatalog();
    cacheCatalog(catalog);
    return catalog;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const cached = readCachedCatalog();
  if (cached) return { ...cached, source: `${cached.source}（本地缓存）` };

  console.warn('在线区服数据加载失败，已使用内置快照:', errors.join('；'));
  return SERVER_CATALOG_SNAPSHOT;
}

export function formatServerSelection(selection?: ServerSelection): string {
  if (!selection) return '请选择区服';
  if (selection.typeId === 'free' && selection.regionName === selection.typeName) {
    return `${selection.typeName} / ${selection.serverName}`;
  }
  return `${selection.typeName} / ${selection.regionName} / ${selection.serverName}`;
}

export function hasCompleteServerSelection(
  selection?: ServerSelection
): selection is ServerSelection {
  return Boolean(
    selection?.typeId &&
    selection.typeName === EXPECTED_TYPE_NAMES[selection.typeId] &&
    isUsableLabel(selection.regionId) &&
    isUsableLabel(selection.regionName) &&
    isUsableLabel(selection.serverId) &&
    isUsableLabel(selection.serverName)
  );
}
