# 梦幻西游商品库

一个基于 Tauri + React 的截图采集工具：框选游戏摊位截图后，使用本地 Windows.Media.Ocr 或百度 OCR 识别文字，可选经 Kimi、DeepSeek 或 Qwen 优化，再提取商品名和原始游戏价格并保存到本机 IndexedDB。

处理链路为：`截图 → OCR（本地 / 百度通用文字识别）→ 商品格式校验 → 可选 AI 优化 → 本地规则兜底 → IndexedDB → 数据看板 → 单向批量上报`。商品记录不会从服务端拉回客户端。

## 配置百度 OCR

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量模板：

   ```powershell
   Copy-Item .env.example .env
   ```

3. 编辑 `.env`，选择百度 OCR 作为识别引擎：

   ```env
   VITE_OCR_PROVIDER=baidu
   ```

4. 启动：

   ```bash
   npm run tauri dev
   ```

   也可以先用 `npm run dev` 检查前端页面。启动后在“设置”页确认 OCR 引擎为“百度 OCR API”，并在设置页填写百度 API Key 和 Secret Key，然后点击“手动截图”测试完整链路。

百度 OCR 密钥只保存在应用的本机设置中，不再支持通过 `VITE_*` 环境变量注入。

## 可选：AI 优化

设置页可开启「AI 优化」，默认供应商为 Kimi，也可以切换 DeepSeek 或 Qwen。只有先通过本地商品截图格式校验的 OCR 文本才会发送给所选服务，用于修正商品名和优化结构化结果；调用失败或无有效结果时自动回退到本地规则解析。

各供应商的 API Key 和模型都在设置页编辑并保存在本机，不从 `.env` 读取。构建只允许非敏感配置进入前端，并会在每次 `npm run build` 后扫描产物；如果发现本机的百度 OCR、Kimi、DeepSeek 或 Qwen 密钥，构建会直接失败。

当前规则会把 `魔兽要诀` 继续细分为具体兽诀，例如 `魔兽要诀（水吸）`、`魔兽要诀（雷吸）`，再分别统计价格；同时兼容 `兽本`、`残卷`、`残破画轴`。只保存能和明确“单价”可靠配对的数据。价格使用 OCR 读到的游戏内原始整数，不做单位换算；截图没有卖家信息时使用 `未知摊位`，数量默认为 `1`。

## 常用命令

```bash
npm run dev       # Vite 前端开发服务
npm run build     # TypeScript 检查并构建前端
npm run lint      # ESLint 检查
npm run tauri dev # Tauri 桌面开发模式
```

## 邀请码、区服与单向录入

区服通过级联下拉完整选择后才能采集：时间服按“时间服 → 大区 → 服务器”三级选择，畅玩服按“畅玩服 → 服务器”两级选择。客户端优先读取已部署的 Supabase 区服接口；未配置或接口不可用时，会依次使用网易藏宝阁公开区服目录、最近一次成功缓存和内置完整快照，首次离线启动也能选择区服。

接口项目位于同级目录 `../mhxy-qujingren-api`。部署后在本项目 `.env` 中配置：

```env
VITE_REMOTE_API_URL=https://<project-ref>.supabase.co/functions/v1/commodity-api
```

客户端无需激活，安装即用。上报时只附带本机应用级机器指纹（`x-machine-id`，不可用于还原 Windows MachineGuid），仅发送给自有接口，不会发送给网易或百度。

每次识别产生一个批量录入请求。本地会先入库；提交失败时保留在重试队列，恢复联网后自动补传。客户端和服务端均保证正常批次间隔不小于 3 秒。OCR 原文和本机截图路径不会上传。
