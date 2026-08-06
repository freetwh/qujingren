/** OCR 服务：本地 Windows.Media.Ocr + 百度 OCR 原生请求 */

import { invoke } from '@tauri-apps/api/core';

/** 调用本地 Windows.Media.Ocr 识别（免费、离线、无需配置） */
export async function recognizeTextLocal(imagePath: string): Promise<string> {
  return invoke<string>('ocr_local', { path: imagePath });
}

/**
 * 调用百度 OCR。
 * 请求放在 Tauri 原生端执行，避免 WebView 直接请求百度接口时被跨域策略拦截。
 */
export async function recognizeText(
  base64Image: string,
  apiKey: string,
  secretKey: string
): Promise<string> {
  return invoke<string>('ocr_baidu', {
    base64Image,
    apiKey,
    secretKey,
  });
}
