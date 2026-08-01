import type { ParsedCommodity } from '../types';

/** 大模型服务 - 将 OCR 文本解析为结构化商品数据 */

const SYSTEM_PROMPT = `你是一个梦幻西游商品信息提取助手。用户会给你一段从游戏截图中 OCR 识别出的文字，你需要从中提取商品信息，以 JSON 数组格式返回。

每个商品包含以下字段：
- name: 商品名称（ string ）
- seller: 卖家名称（ string ）
- price: 价格，单位万两（ number ）
- quantity: 数量（ number，默认为 1 ）

请只返回 JSON 数组，不要返回其他内容。如果无法识别出商品信息，返回空数组 []。

示例输出：
[{"name":"金柳露","seller":"玩家甲","price":50,"quantity":1}]`;

/** 调用通义千问 API */
async function callQwen(apiKey: string, text: string): Promise<string> {
  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      input: {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请从以下 OCR 文本中提取商品信息：\n\n${text}` },
        ],
      },
      parameters: {
        result_format: 'message',
        temperature: 0.1,
      },
    }),
  });

  const data = await res.json();

  if (data.code) {
    throw new Error(`通义千问 API 错误: ${data.message}`);
  }

  return data.output.choices[0].message.content;
}

/** 调用 DeepSeek API */
async function callDeepSeek(apiKey: string, text: string): Promise<string> {
  const url = 'https://api.deepseek.com/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请从以下 OCR 文本中提取商品信息：\n\n${text}` },
      ],
      temperature: 0.1,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`DeepSeek API 错误: ${data.error.message}`);
  }

  return data.choices[0].message.content;
}

/** 解析大模型返回的 JSON */
function parseLlmResponse(response: string): ParsedCommodity[] {
  // 尝试提取 JSON 数组
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item: Record<string, unknown>) =>
        typeof item.name === 'string' &&
        typeof item.seller === 'string' &&
        typeof item.price === 'number'
    )
    .map((item: Record<string, unknown>) => ({
      name: String(item.name),
      seller: String(item.seller),
      price: Number(item.price),
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
    }));
}

/** 调用大模型解析 OCR 文本 */
export async function parseCommodities(
  text: string,
  provider: 'qwen' | 'deepseek',
  apiKey: string
): Promise<ParsedCommodity[]> {
  const response =
    provider === 'qwen' ? await callQwen(apiKey, text) : await callDeepSeek(apiKey, text);

  return parseLlmResponse(response);
}
