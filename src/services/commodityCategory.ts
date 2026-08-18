import type { ParsedCommodity } from '../types';

const BEAST_SKILL_CATEGORY = '魔兽要诀';

/**
 * AI 擅长修正技能名，但偶尔会省略「魔兽要诀（...）」外层，导致纯技能名被归到
 * 「其他」。固定规则已经从截图卡片结构中确定了类别，因此用价格和原顺序把类别
 * 提示合并回 AI 结果，同时保留 AI 修正后的名称。
 */
export function reconcileCommodityCategories(
  aiCommodities: ParsedCommodity[],
  ruleCommodities: ParsedCommodity[]
): ParsedCommodity[] {
  const sameLength = aiCommodities.length === ruleCommodities.length;

  return aiCommodities.map((commodity, index) => {
    if (commodity.category !== '其他') return commodity;

    const positionalHint = sameLength ? ruleCommodities[index] : undefined;
    if (
      positionalHint &&
      positionalHint.price === commodity.price &&
      positionalHint.category === BEAST_SKILL_CATEGORY
    ) {
      return { ...commodity, category: positionalHint.category };
    }

    const priceHints = ruleCommodities.filter((hint) => hint.price === commodity.price);
    const hintedCategories = new Set(priceHints.map((hint) => hint.category));
    if (hintedCategories.size === 1) {
      const [category] = hintedCategories;
      if (category === BEAST_SKILL_CATEGORY) return { ...commodity, category };
    }

    return commodity;
  });
}
