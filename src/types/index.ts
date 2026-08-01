/** 商品记录 */
export interface CommodityRecord {
  id?: number;
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
  llmProvider: 'qwen' | 'deepseek';
  llmApiKey: string;
  shortcut: string;
  currentServer: string;
  currentGame: string;
  supabaseUrl: string;
  supabaseKey: string;
  autoUpload: boolean;
}

/** OCR 识别结果 */
export interface OcrResult {
  text: string;
  items: ParsedCommodity[];
}

/** 大模型解析后的商品 */
export interface ParsedCommodity {
  name: string;
  seller: string;
  price: number;
  quantity: number;
}

/** Supabase 上报数据 */
export interface UploadRecord {
  name: string;
  server: string;
  avg_price: number;
  sample_count: number;
  date: string;
}
