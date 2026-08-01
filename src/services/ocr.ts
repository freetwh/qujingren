/** OCR 服务：本地 Windows.Media.Ocr（默认）+ 百度 OCR API */

import { invoke } from '@tauri-apps/api/core';

/** 调用本地 Windows.Media.Ocr 识别（免费、离线、无需配置） */
export async function recognizeTextLocal(imagePath: string): Promise<string> {
  return invoke<string>('ocr_local', { path: imagePath });
}

interface BaiduTokenResponse {
  access_token: string;
  expires_in: number;
}

interface BaiduOcrWord {
  words: string;
}

interface BaiduOcrResponse {
  words_result: BaiduOcrWord[];
  words_result_num: number;
  error_msg?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** 获取百度 OCR access_token */
async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

  const res = await fetch(url, { method: 'POST' });
  const data: BaiduTokenResponse = await res.json();

  if (!data.access_token) {
    throw new Error('获取百度 OCR token 失败');
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

/** 调用百度 OCR 通用文字识别 */
export async function recognizeText(
  base64Image: string,
  apiKey: string,
  secretKey: string
): Promise<string> {
  const token = await getAccessToken(apiKey, secretKey);

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`;

  const body = new URLSearchParams({
    image: base64Image,
    language_type: 'CHN_ENG',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data: BaiduOcrResponse = await res.json();

  if (data.error_msg) {
    throw new Error(`OCR 识别失败: ${data.error_msg}`);
  }

  return data.words_result.map((w) => w.words).join('\n');
}
