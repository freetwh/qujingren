# 梦幻西游商品库

一个基于 Tauri + React 的截图采集工具：框选游戏摊位截图后，使用本地 Windows.Media.Ocr 或百度 OCR 识别文字，可选经 Kimi 开放平台纠错整理，再按固定卡片规律提取商品名和原始游戏价格，并保存到本机 IndexedDB。

处理链路为：`截图 → OCR（本地 / 百度通用文字识别）→ 可选 Kimi AI 抽取 → 本地规则解析兜底 → IndexedDB → 数据看板`。除可选的 AI 抽取步骤外不调用大模型，也不会把商品数据同步到远程。

## 配置百度 OCR

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量模板：

   ```powershell
   Copy-Item .env.example .env
   ```

3. 编辑 `.env`，至少填写以下内容：

   ```env
   VITE_OCR_PROVIDER=baidu
   VITE_BAIDU_OCR_API_KEY=你的百度 API Key
   VITE_BAIDU_OCR_SECRET_KEY=你的百度 Secret Key
   ```

4. 启动：

   ```bash
   npm run tauri dev
   ```

   也可以先用 `npm run dev` 检查前端页面。启动后在“设置”页确认 OCR 引擎为“百度 OCR API”，然后点击“手动截图”测试完整链路。

环境变量优先于设置页保存的 OCR 配置；不填写环境变量时，仍可以直接在设置页输入并保存在本机。真实 `.env` 已被 Git 忽略，不能提交真实密钥。

## 可选：Kimi AI 抽取商品数据

OCR 常把商品名识错或识残，比如「水漫金U」（应为「水漫金山」）、「泰山压」（应为「泰山压顶」）、「魔碧要诀」（应为「魔兽要诀」）。开启 AI 整理后，Kimi 会基于梦幻西游真实物品名直接抽取结构化商品数据（名称、单价、数量、等级、摊主）并纠错补全商品名；抽取失败或无结果时自动回退到固定规则解析，不会丢数据。

在 `.env` 中追加（或直接在设置页「AI 整理」卡片里配置）：

```env
VITE_AI_REFINE=1
VITE_KIMI_API_KEY=你的 Kimi 开放平台 API Key（sk-...）
VITE_KIMI_MODEL=moonshot-v1-8k
```

Key 在 [Kimi 开放平台](https://platform.moonshot.cn) 的「用户中心 → API Key 管理」创建，按 token 计费，与 Kimi 会员订阅额度相互独立；每次整理只有几百 token，成本极低。请求由 Tauri 原生端发出，WebView 不直接接触密钥接口。

当前规则会把 `魔兽要诀` 继续细分为具体兽诀，例如 `魔兽要诀（水吸）`、`魔兽要诀（雷吸）`，再分别统计价格；同时兼容 `兽本`、`残卷`、`残破画轴`。只保存能和明确“单价”可靠配对的数据。价格使用 OCR 读到的游戏内原始整数，不做单位换算；截图没有卖家信息时使用 `未知摊位`，数量默认为 `1`。

## 常用命令

```bash
npm run dev       # Vite 前端开发服务
npm run build     # TypeScript 检查并构建前端
npm run lint      # ESLint 检查
npm run tauri dev # Tauri 桌面开发模式
```
