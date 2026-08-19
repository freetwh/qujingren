/** AI 优化：OCR 文本 → 结构化商品数据 */

import { invoke } from '@tauri-apps/api/core';
import type { AiProvider, AppSettings, ParsedCommodity } from '../types';
import { reconcileCommodityCategories } from './commodityCategory';
import { parseCommoditiesByRules } from './ruleParser';

const UNKNOWN_SELLER = '未知摊位';

interface AiExtractedItem {
  category?: unknown;
  name?: unknown;
  price?: unknown;
  quantity?: unknown;
  level?: unknown;
}

interface AiExtractResult {
  seller?: unknown;
  items?: unknown;
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

export function getAiProviderConfig(settings: AppSettings) {
  switch (settings.aiProvider) {
    case 'deepseek':
      return { apiKey: settings.deepseekApiKey, model: settings.deepseekModel };
    case 'qwen':
      return { apiKey: settings.qwenApiKey, model: settings.qwenModel };
    default:
      return { apiKey: settings.kimiApiKey, model: settings.kimiModel };
  }
}

async function requestAiOptimize(
  ocrText: string,
  apiKey: string,
  provider: AiProvider,
  model: string
): Promise<string> {
  return invoke<string>('ai_optimize', { ocrText, apiKey, provider, model });
}

function stripCodeFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value.replace(/[,，]/g, '')) : Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function toParsedCommodities(result: AiExtractResult): ParsedCommodity[] {
  if (!Array.isArray(result.items)) return [];

  const seller =
    typeof result.seller === 'string' && result.seller.trim()
      ? result.seller.trim()
      : UNKNOWN_SELLER;
  const commodities: ParsedCommodity[] = [];

  for (const raw of result.items as AiExtractedItem[]) {
    if (!raw || typeof raw.name !== 'string') continue;

    const name = raw.name.replace(/\s+/g, '').trim();
    const price = toPositiveInt(raw.price);
    if (!name || price === null) continue;

    const quantity = toPositiveInt(raw.quantity) ?? 1;
    const level = toPositiveInt(raw.level);
    const category = typeof raw.category === 'string' ? raw.category.trim() : '';

    if (level !== null || /^等级\d+/.test(name)) {
      const petName = name.replace(/^等级\d+/, '');
      commodities.push({
        category: '宠物',
        name: `等级${level ?? 0} ${petName}`,
        seller,
        price,
        quantity,
        level: level ?? 0,
      });
      continue;
    }

    const hasBeastSkillMarker = /魔[兽碧]要[决诀]/.test(name);
    const hasBeastSkillCategory = /魔[兽碧]要[决诀]/.test(category);
    if (hasBeastSkillMarker || hasBeastSkillCategory) {
      const subtypeMatch = /魔[兽碧]要[决诀][（(]([^）)]+)[）)]/.exec(name);
      const subtype = subtypeMatch?.[1] ?? (hasBeastSkillMarker ? null : name);
      if (!subtype) continue;
      commodities.push({
        category: '魔兽要诀',
        name: subtype,
        seller,
        price,
        quantity,
        level: null,
      });
      continue;
    }

    commodities.push({ category: '其他', name, seller, price, quantity, level: null });
  }

  return commodities;
}

/**
 * 使用所选供应商优化 OCR 结果。无有效商品时返回空数组，由调用方回退本地规则。
 */
export async function optimizeCommoditiesWithAi(
  ocrText: string,
  apiKey: string,
  provider: AiProvider,
  model: string
): Promise<ParsedCommodity[]> {
  const content = await requestAiOptimize(ocrText, apiKey, provider, model);
  console.log(`[AI] ${AI_PROVIDER_LABELS[provider]} 优化结果:`, content);

  let parsed: AiExtractResult;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    console.warn(`[AI] ${AI_PROVIDER_LABELS[provider]} 返回的内容不是合法 JSON`);
    return [];
  }

  return reconcileCommodityCategories(
    toParsedCommodities(parsed),
    parseCommoditiesByRules(ocrText)
  );
}
