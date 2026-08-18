/** Kimi（Moonshot）开放平台：OCR 文本 → 结构化商品数据抽取 */

import { invoke } from '@tauri-apps/api/core';
import type { ParsedCommodity } from '../types';
import { reconcileCommodityCategories } from './commodityCategory';
import { parseCommoditiesByRules } from './ruleParser';

const UNKNOWN_SELLER = '未知摊位';

/** Kimi 返回的单个商品（字段宽松，入库前统一校验） */
interface KimiExtractedItem {
  category?: unknown;
  name?: unknown;
  price?: unknown;
  quantity?: unknown;
  level?: unknown;
}

interface KimiExtractResult {
  seller?: unknown;
  items?: unknown;
}

/**
 * 调用 Kimi 开放平台，把 OCR 原始文本抽取为结构化商品 JSON。
 * 请求由 Tauri 原生端发出，避免 WebView 跨域限制；
 * 模型可能被要求输出「魔兽要诀（技能名）」等修正后的标准名称。
 */
async function requestKimiExtract(
  ocrText: string,
  apiKey: string,
  model: string
): Promise<string> {
  return invoke<string>('kimi_extract', {
    ocrText,
    apiKey,
    model,
  });
}

/** 容忍模型偶发地在 JSON 外面包 Markdown 代码块 */
function stripCodeFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value.replace(/[,，]/g, '')) : Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/**
 * 把 Kimi 抽取结果映射为 ParsedCommodity，与固定规则解析保持同样的分类约定：
 *  - 宠物：category = '宠物'，名称前缀「等级N 」；
 *  - 魔兽要诀：category = '魔兽要诀'，名称只保留技能名（与规则解析产出的历史数据一致）；
 *  - 其余商品：category = '其他'。
 * 名字为空、价格不是正整数的条目直接丢弃。
 */
function toParsedCommodities(result: KimiExtractResult): ParsedCommodity[] {
  if (!Array.isArray(result.items)) return [];

  const seller =
    typeof result.seller === 'string' && result.seller.trim()
      ? result.seller.trim()
      : UNKNOWN_SELLER;

  const commodities: ParsedCommodity[] = [];

  for (const raw of result.items as KimiExtractedItem[]) {
    if (!raw || typeof raw.name !== 'string') continue;

    const name = raw.name.replace(/\s+/g, '').trim();
    const price = toPositiveInt(raw.price);
    if (!name || price === null) continue;

    const quantity = toPositiveInt(raw.quantity) ?? 1;
    const level = toPositiveInt(raw.level);
    const category = typeof raw.category === 'string' ? raw.category.trim() : '';

    if (level !== null || /^等级\d+/.test(name)) {
      // 宠物卡片：等级并入名称，与规则解析的「等级N 名字」格式一致
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
      // 优先读取复合名称；若模型正确返回了类别但偶尔漏掉外层，仍保住该类别。
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

    commodities.push({
      category: '其他',
      name,
      seller,
      price,
      quantity,
      level: null,
    });
  }

  return commodities;
}

/**
 * 用 Kimi 从 OCR 文本中直接抽取商品列表（含商品名纠错补全）。
 * 解析不出任何商品时返回空数组，由调用方回退到固定规则解析。
 * 网络/接口错误会抛出异常。
 */
export async function extractCommoditiesWithKimi(
  ocrText: string,
  apiKey: string,
  model: string
): Promise<ParsedCommodity[]> {
  const content = await requestKimiExtract(ocrText, apiKey, model);
  console.log('[AI] Kimi 抽取结果:', content);

  let parsed: KimiExtractResult;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    console.warn('[AI] Kimi 返回不是合法 JSON，放弃 AI 结果');
    return [];
  }

  const commodities = toParsedCommodities(parsed);
  return reconcileCommodityCategories(commodities, parseCommoditiesByRules(ocrText));
}
