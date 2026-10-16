import type { CommodityRecord, ServerSelection } from '../types';
import { getDeviceHeaders } from './device';
import { getRemoteApiConfig } from './env';

const QUEUE_KEY = 'mhxy_remote_ingestion_queue_v1';
const CLIENT_KEY = 'mhxy_remote_client_id_v1';
const MIN_SEND_INTERVAL_MS = 3_000;

interface RemoteBatch {
  requestId: string;
  clientId: string;
  sourceId: string;
  capturedAt: string;
  replaceExisting: boolean;
  game: string;
  server: ServerSelection;
  records: Array<{
    category: string;
    name: string;
    seller: string;
    price: number;
    quantity: number;
    level: number | null;
    observedDate: string;
  }>;
}

type SendResult =
  | { status: 'sent' | 'discard' }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'retry' };

let flushPromise: Promise<number> | undefined;
let lastSendStartedAt = 0;

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

function readQueue(): RemoteBatch[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(value) ? (value as RemoteBatch[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: RemoteBatch[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForSendSlot(): Promise<void> {
  const remaining = MIN_SEND_INTERVAL_MS - (Date.now() - lastSendStartedAt);
  if (remaining > 0) await delay(remaining);
  lastSendStartedAt = Date.now();
}

async function sendBatch(batch: RemoteBatch): Promise<SendResult> {
  const { url } = getRemoteApiConfig();
  if (!url) return { status: 'retry' };

  const headers = {
    'content-type': 'application/json',
    ...(await getDeviceHeaders()),
  };

  await waitForSendSlot();

  try {
    const response = await fetch(`${url}/ingestions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (response.ok) return { status: 'sent' };
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '3');
      return {
        status: 'rate-limited',
        retryAfterMs: Number.isFinite(retryAfterSeconds)
          ? Math.max(MIN_SEND_INTERVAL_MS, retryAfterSeconds * 1_000)
          : MIN_SEND_INTERVAL_MS,
      };
    }
    if ([400, 401, 403, 409, 422].includes(response.status)) {
      return { status: 'discard' };
    }
    return { status: 'retry' };
  } catch (error) {
    console.warn('数据提交暂缓:', error);
    return { status: 'retry' };
  }
}

/** 依次重试旧请求。只有接口确认成功后才会从本地队列删除。 */
export async function flushRemoteQueue(): Promise<number> {
  if (flushPromise) return flushPromise;
  flushPromise = flushRemoteQueueSerially().finally(() => {
    flushPromise = undefined;
  });
  return flushPromise;
}

async function flushRemoteQueueSerially(): Promise<number> {
  const { url } = getRemoteApiConfig();
  if (!url) return 0;

  let sent = 0;
  while (true) {
    const batch = readQueue()[0];
    if (!batch) break;

    let result = await sendBatch(batch);
    while (result.status === 'rate-limited') {
      await delay(result.retryAfterMs);
      result = await sendBatch(batch);
    }

    if (result.status === 'sent' || result.status === 'discard') {
      const latest = readQueue().filter((item) => item.requestId !== batch.requestId);
      writeQueue(latest);
      if (result.status === 'sent') sent += 1;
    } else {
      break;
    }
  }
  return sent;
}

/** 每次本地识别入库对应一个批次请求；不上传 OCR 原文和本机截图路径。 */
export async function enqueueRemoteIngestion(input: {
  game: string;
  server: ServerSelection;
  screenshotPath: string;
  replaceExisting: boolean;
  records: CommodityRecord[];
}): Promise<void> {
  const { url } = getRemoteApiConfig();
  if (!url) return;

  const batch: RemoteBatch = {
    requestId: crypto.randomUUID(),
    clientId: getClientId(),
    sourceId: await sha256(input.screenshotPath),
    capturedAt: new Date().toISOString(),
    replaceExisting: input.replaceExisting,
    game: input.game,
    server: input.server,
    records: input.records.map((record) => ({
      category: record.category,
      name: record.name,
      seller: record.seller,
      price: record.price,
      quantity: record.quantity,
      level: record.level ?? null,
      observedDate: record.date,
    })),
  };

  writeQueue([...readQueue(), batch]);
  void flushRemoteQueue();
}

export function startRemoteRetry(): () => void {
  const retry = () => void flushRemoteQueue();
  window.addEventListener('online', retry);
  retry();
  return () => window.removeEventListener('online', retry);
}
