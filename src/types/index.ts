/** 商品记录 */
export interface CommodityRecord {
  id?: number;
  category: string;
  name: string;
  seller: string;
  price: number;
  quantity: number;
  /** 宠物类商品的等级，普通商品为 null */
  level?: number | null;
  server: string;
  /** 区服层级信息；旧版数据没有这些字段，因此保持可选。 */
  serverType?: ServerTypeId;
  region?: string;
  serverId?: string;
  date: string;
  screenshotPath: string;
  rawText: string;
  createdAt: string;
}

export type ServerTypeId = 'time' | 'free';

export interface GameServer {
  id: string;
  name: string;
}

export interface ServerRegion {
  id: string;
  name: string;
  servers: GameServer[];
}

export interface ServerType {
  id: ServerTypeId;
  name: string;
  regions: ServerRegion[];
}

export interface ServerCatalog {
  types: ServerType[];
  source: string;
  updatedAt: string;
}

export interface ServerSelection {
  typeId: ServerTypeId;
  typeName: string;
  regionId: string;
  regionName: string;
  serverId: string;
  serverName: string;
}

/** 旧版本中用户手工维护的区服，仅用于兼容已有设置。 */
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

/** 单个商品在某个周期内的均价汇总 */
export interface PeriodAverage {
  /** 今日均价，当日无样本时为 null */
  todayAvg: number | null;
  todayCount: number;
  /** 本自然月均价，当月无样本时为 null */
  monthAvg: number | null;
  monthCount: number;
}

/** key 为 `分类\0名称\0区服` */
export type PeriodAverageMap = Map<string, PeriodAverage>;

/** 悬浮挂件配置 */
export interface WidgetConfig {
  locked: boolean;
  opacity: number;
  maxRows: number;
  alwaysOnTop: boolean;
}

/** 应用设置 */
export interface AppSettings {
  ocrProvider: 'local' | 'baidu';
  baiduApiKey: string;
  baiduSecretKey: string;
  /** OCR 后是否调用 Kimi 开放平台整理文本 */
  aiRefine: boolean;
  kimiApiKey: string;
  kimiModel: string;
  /** 商品价格与均价的展示方式 */
  numberDisplayFormat: 'chinese-unit' | 'comma';
  shortcut: string;
  currentServer: string;
  /** 必填区服；时间服三级、畅玩服两级，存储层均保留完整 region 字段。 */
  serverSelection?: ServerSelection;
  currentGame: string;
  /** 已添加的区服列表，持久化以便选择后跨重启保留 */
  servers?: Server[];
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
  /** 宠物类商品的等级，普通商品为 null */
  level?: number | null;
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
