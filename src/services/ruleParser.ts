import type { ParsedCommodity } from '../types';

const UNKNOWN_SELLER = '未知摊位';

const ITEM_ALIASES: ReadonlyArray<{
  name: string;
  aliases: readonly string[];
}> = [
  {
    name: '魔兽要诀',
    aliases: ['魔兽要诀', '魔兽要决', '魔碧要诀', '魔碧要决'],
  },
  { name: '兽本', aliases: ['兽本', '獸本'] },
  { name: '残卷', aliases: ['残卷', '殘卷', '残眷', '殘眷'] },
  {
    name: '残破画轴',
    aliases: ['残破画轴', '殘破畫軸', '残破畫軸', '殘破画轴'],
  },
];

interface Match<T> {
  index: number;
  value: T;
}

interface PriceDetail {
  price: number;
  subtype: string | null;
}

const SUBTYPE_ALIASES: Readonly<Record<string, string>> = {
  士吸: '土吸',
  法爆: '法暴',
  魔心: '魔之心',
};

const NON_SUBTYPE_LABELS = /^(?:观看图鉴|物品类|召唤兽类|制造类|数量|总价|總價|金钱|金錢|购买|購買|附近所有摊位|更多|关注|摊主|攤主|ID|X)$/;

function compactLine(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .replace(/單價/g, '单价');
}

function extractNames(line: string): string[] {
  const matches: Match<string>[] = [];

  for (const item of ITEM_ALIASES) {
    for (const alias of item.aliases) {
      let fromIndex = 0;
      while (fromIndex < line.length) {
        const index = line.indexOf(alias, fromIndex);
        if (index < 0) break;
        matches.push({ index, value: item.name });
        fromIndex = index + alias.length;
      }
    }
  }

  return matches
    .sort((a, b) => a.index - b.index)
    .filter((match, index, all) => {
      const previous = all[index - 1];
      return !previous || previous.index !== match.index || previous.value !== match.value;
    })
    .map((match) => match.value);
}

function parsePrice(rawPrice: string): number | null {
  const normalized = rawPrice.replace(/[,，]/g, '');
  if (!/^\d+$/.test(normalized)) return null;

  const price = Number(normalized);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

function normalizeSubtype(rawSubtype: string): string | null {
  const subtype = compactLine(rawSubtype).replace(/^[:：·•|/-]+|[:：·•|/-]+$/g, '');
  if (!subtype || subtype.length > 12) return null;
  if (NON_SUBTYPE_LABELS.test(subtype) || /^\d+$/.test(subtype)) return null;
  if (extractNames(subtype).length > 0 || subtype.includes('单价')) return null;

  return SUBTYPE_ALIASES[subtype] || subtype;
}

function inferAmbiguousSubtype(details: PriceDetail[], index: number): string | null {
  const subtype = details[index].subtype;
  if (subtype !== '吸') return subtype;

  // 当前游戏字体偶尔会让百度漏掉“雷”。仅在同一组前面已经出现水吸、土吸时修正。
  const nearby = details
    .slice(Math.max(0, index - 3), index)
    .map((detail) => detail.subtype);
  return nearby.includes('水吸') && nearby.includes('土吸') ? '雷吸' : subtype;
}

function extractPriceDetails(lines: string[]): PriceDetail[] {
  const details: PriceDetail[] = [];
  let pendingSubtype: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (pendingSubtype !== null || index > 0 && /^单价[:：]?$/.test(lines[index - 1])) {
      const standalonePrice = /^([0-9][0-9,，]*)$/.exec(line);
      const price = standalonePrice ? parsePrice(standalonePrice[1]) : null;
      if (price !== null) {
        details.push({ price, subtype: pendingSubtype });
        pendingSubtype = null;
        continue;
      }
      pendingSubtype = null;
    }

    const markedPrice = /单价[:：]?[¥￥]?([0-9][0-9,，]*)/.exec(line);
    if (markedPrice) {
      const price = parsePrice(markedPrice[1]);
      if (price !== null) {
        const markerIndex = markedPrice.index;
        const inlineSubtype = line.slice(0, markerIndex);
        const subtype = normalizeSubtype(inlineSubtype || lines[index - 1] || '');
        details.push({ price, subtype });
      }
      continue;
    }

    const standaloneMarker = /^(.*?)单价[:：]?$/.exec(line);
    if (standaloneMarker) {
      pendingSubtype = normalizeSubtype(standaloneMarker[1] || lines[index - 1] || '');
    }
  }

  return details.map((detail, index) => ({
    ...detail,
    subtype: inferAmbiguousSubtype(details, index),
  }));
}

function extractSeller(lines: string[]): string {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineSeller = /^(?:摊主|攤主)[:：]?(.*)$/.exec(line);
    if (!inlineSeller) continue;

    const seller = inlineSeller[1] || lines[index + 1] || '';
    if (seller && !/^(?:ID|总价|總價|数量|數量|金钱|金錢)$/.test(seller)) {
      return seller;
    }
  }

  return UNKNOWN_SELLER;
}

function createCommodity(
  name: string,
  price: number,
  seller: string,
  subtype: string | null
): ParsedCommodity | null {
  if (name === '魔兽要诀' && !subtype) return null;

  return {
    category: name === '魔兽要诀' ? name : '其他',
    name: name === '魔兽要诀' ? subtype! : name,
    seller,
    price,
    quantity: 1,
  };
}

/**
 * 按固定摊位卡片规律解析 OCR 文本。
 *
 * 只接受白名单商品名以及带“单价”的正整数价格。价格按游戏内原值保存，
 * 不换算单位。跨行结果只有在商品名和价格数量完全一致时才会配对，避免
 * OCR 漏行后把后续价格错配给其他商品。
 */
export function parseCommoditiesByRules(ocrText: string): ParsedCommodity[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map(compactLine)
    .filter(Boolean);
  const seller = extractSeller(lines);
  const names = lines.flatMap(extractNames);
  const details = extractPriceDetails(lines);

  // 没有坐标时只在两组数量完全一致的情况下按百度阅读顺序配对。
  if (names.length === 0 || names.length !== details.length) return [];

  return names.flatMap((name, index) => {
    const detail = details[index];
    const commodity = createCommodity(name, detail.price, seller, detail.subtype);
    return commodity ? [commodity] : [];
  });
}
