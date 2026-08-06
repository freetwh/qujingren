# 梦幻西游商品库

一个基于 Tauri + React 的截图采集工具：框选游戏摊位截图后，使用百度 OCR 识别文字，再按固定卡片规律提取商品名和原始游戏价格，并保存到本机 IndexedDB。

处理链路为：`截图 → 百度通用文字识别（不返回坐标）→ 本地规则解析 → IndexedDB → 数据看板`。应用不调用大模型，也不会把商品数据同步到远程。

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

当前规则会把 `魔兽要诀` 继续细分为具体兽诀，例如 `魔兽要诀（水吸）`、`魔兽要诀（雷吸）`，再分别统计价格；同时兼容 `兽本`、`残卷`、`残破画轴`。只保存能和明确“单价”可靠配对的数据。价格使用 OCR 读到的游戏内原始整数，不做单位换算；截图没有卖家信息时使用 `未知摊位`，数量默认为 `1`。

## 常用命令

```bash
npm run dev       # Vite 前端开发服务
npm run build     # TypeScript 检查并构建前端
npm run lint      # ESLint 检查
npm run tauri dev # Tauri 桌面开发模式
```
