/** 商品记录 */
export interface CommodityRecord {
  id?: number;
  category: string;
  name: string;
  seller: string;
  price: number;
  quantity: number;
  server: string;
  date: string;
  screenshotPath: string;
  rawText: string;
  createdAt: string;
}

/** 区服 */
export interface Server {
  id: string;
  name: string;
  isDefault: boolean;
}

/** 均价统计 */
export interface AveragePrice {
  category: string;
  name: string;
  server: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  sampleCount: number;
  outlierCount: number;
  date: string;
}

/** 应用设置 */
export interface AppSettings {
  ocrProvider: 'local' | 'baidu';
  baiduApiKey: string;
  baiduSecretKey: string;
  shortcut: string;
  currentServer: string;
  currentGame: string;
}

/** OCR 识别结果 */
export interface OcrResult {
  text: string;
  items: ParsedCommodity[];
}

/** 固定规则解析后的商品 */
export interface ParsedCommodity {
  category: string;
  name: string;
  seller: string;
  price: number;
  quantity: number;
}

/** Tauri 框选完成后返回的截图 */
export interface ScreenshotResult {
  path: string;
  base64: string;
  timestamp: string;
}

/** Tauri 全局快捷键事件 */
export interface CaptureEvent {
  status: string;
  message: string;
  path?: string | null;
}
