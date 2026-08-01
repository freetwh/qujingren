import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UploadRecord } from '../types';

let client: SupabaseClient | null = null;

/** 初始化 Supabase 客户端 */
export function initSupabase(url: string, key: string) {
  client = createClient(url, key);
}

/** 上报均价数据 */
export async function uploadAverages(records: UploadRecord[]): Promise<boolean> {
  if (!client) {
    console.error('Supabase 客户端未初始化');
    return false;
  }

  const { error } = await client.from('commodity_averages').upsert(records, {
    onConflict: 'name,server,date',
  });

  if (error) {
    console.error('Supabase 上报失败:', error.message);
    return false;
  }

  return true;
}

/** 测试 Supabase 连接 */
export async function testConnection(url: string, key: string): Promise<boolean> {
  const testClient = createClient(url, key);
  const { error } = await testClient.from('commodity_averages').select('count').limit(1);
  return !error;
}
