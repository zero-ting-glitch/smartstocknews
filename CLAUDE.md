# SmartStock - 智慧畜牧信息聚合站

## 项目简介

聚焦智慧畜牧（IoT/AI/自动化/机器人在养殖业和种植业的应用）的新闻聚合站。海外信源为主，按物种/作物细分频道。RSS 仅作发现入口，实际爬取完整文章页面，AI 评分翻译后以自定义排版展示。参考 AIHOT (aihot.virxact.com) 设计。

## 目录结构

```
smartstock/
├── src/
│   ├── app/               # Next.js App Router 页面
│   │   ├── page.tsx       # 主页（时间线）
│   │   ├── detail/        # 文章详情页（query param 路由）
│   │   ├── pig|poultry|cattle|sheep/  # 畜种频道
│   │   ├── field|fruit|horticulture/   # 作物频道
│   │   ├── all/           # 全部动态
│   │   └── about/         # 关于页面
│   ├── components/        # React 组件
│   │   ├── Sidebar.tsx    # 侧边栏导航
│   │   ├── Timeline.tsx   # 时间线
│   │   ├── NewsCard.tsx   # 新闻卡片（链接到详情页）
│   │   ├── HotCard.tsx    # 热点卡片
│   │   └── FilterChips.tsx
│   └── lib/
│       ├── collector/     # 数据采集
│       │   ├── scraper.ts # Web 爬虫（cheerio）+ SSRF 防护
│       │   └── index.ts   # RSS 采集 + 聚合
│       ├── processor/     # AI 处理
│       │   ├── scorer.ts  # AI 评分（五维）
│       │   ├── translator.ts  # AI 翻译
│       │   └── calculator.ts  # 质量分计算
│       ├── db.ts          # Prisma 客户端单例
│       ├── config.ts      # BASE_PATH 等前端配置
│       └── utils.ts       # formatTime, speciesNames, speciesColors
├── scripts/
│   ├── run-pipeline.ts    # 一键管线（5 步：同步→采集→爬取→AI→导出）
│   ├── export-static.ts   # 独立导出脚本
│   └── seed-sources.ts    # 信源初始化
├── data/sources.json      # 12 个信源配置
├── prisma/schema.prisma   # 数据库 schema
├── public/
│   ├── _headers           # 安全头（CSP 等）
│   └── data/              # 导出的静态 JSON
├── .github/workflows/
│   ├── deploy.yml         # push to master → 构建 → GitHub Pages
│   └── collect.yml        # 手动触发 → 采集+AI+导出 → 自动提交
├── .env.example           # 环境变量模板
└── .env                   # 本地密钥（不进 git）
```

## 命名规范

- 文件/目录名：kebab-case（`news-card.tsx`、`sources.json`）
- 组件文件：PascalCase（`NewsCard.tsx`）
- 函数/变量：camelCase（`collectAll`、`qualityScore`）
- 常量：UPPER_SNAKE_CASE（`SCORING_PROMPT`）
- 数据库字段：camelCase（`sourceId`、`titleZh`）
- 文件内容：优先中文注释，代码/变量名英文

## 技术栈

- Next.js 16 (App Router) + TypeScript + `output: 'export'` 静态导出
- Tailwind CSS v4 + CSS 变量（亮色主题）
- Prisma + SQLite（仅 CI 管线使用，本地开发也可用）
- DeepSeek API（openai SDK，统一调用评分+翻译+摘要+精选理由）
- cheerio（HTML 解析，全文爬取）
- rss-parser（RSS feed 解析）
- 部署：GitHub Pages + GitHub Actions CI/CD

## 数据管线（5 步）

```
[1/5] 同步信源    sources.json → SQLite（upsert）
[2/5] 采集 URL    RSS 解析 + 列表页爬取 → 发现文章链接
[3/5] 全文爬取    cheerio 解析 → 提取文本/图片/作者（已爬过跳过）
[4/5] AI 处理     单次 DeepSeek 调用 → 五维评分+中文翻译+摘要+精选理由
[5/5] 导出 JSON   items.json + items/{id}.json + hot-items.json + stats.json
```

## 开发原则

1. **能用代码就不用 AI**：去重/权重/阈值判断全用代码，AI 只做语义评分
2. **信源比信息重要**：白名单制，T1/T1.5/T2 分级
3. **宁缺毋滥**：宁可少一个信源，也不放垃圾信源
4. **先建规范再动手**：新需求先写 SPEC.md，确认后再编码

## 安全规范

- API Key 仅通过环境变量 / GitHub Secrets 传递，绝不进代码
- SSRF 防护：URL 协议校验 + 私有 IP 拦截 + DNS 解析后 IP 校验
- 前端外链统一 `startsWith('http')` 校验 + `rel="noopener noreferrer"`
- contentHtml 导出前净化（移除 script/style/事件属性）
- GitHub Actions 全部锁定到 commit SHA
- 详情页 id 参数正则校验 `/^[a-zA-Z0-9_-]+$/`

## 环境变量

```bash
DATABASE_URL="file:./dev.db"
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
ADMIN_TOKEN=xxx  # 采集触发鉴权（当前未启用 API 路由）
```

## 常用命令

```bash
npm run dev              # 本地开发 → http://localhost:3000/smartstocknews/
npm run build            # 静态导出到 out/
npx prisma generate      # 生成 Prisma 客户端
npx prisma db push       # 同步 schema 到 SQLite
npx prisma studio        # 可视化查看数据库
npx tsx scripts/run-pipeline.ts   # 运行完整管线
```

## 部署

- 线上地址：https://zero-ting-glitch.github.io/smartstocknews/
- GitHub 仓库：https://github.com/zero-ting-glitch/smartstocknews
- 推送到 master 自动触发构建和部署
- 采集工作流：GitHub Actions 手动触发，运行管线后自动提交 `public/data/` 的变更
- Secret 名称：`CFG_1`（DeepSeek API Key）

## 物种/作物频道

| 频道 | 路径 | subcategory |
|------|------|-------------|
| 猪业 | `/pig` | pig |
| 禽业 | `/poultry` | poultry |
| 牛业 | `/cattle` | cattle |
| 羊业 | `/sheep` | sheep |
| 大田 | `/field` | field |
| 果蔬 | `/fruit` | fruit |
| 园艺 | `/horticulture` | horticulture |

## 信源体系

12 个信源，分 RSS 和列表页爬取两种方式。配置在 `data/sources.json`。

| 等级 | 定义 | 质量分权重 |
|------|------|-----------|
| T1 | 官方一手/学术 | 1.0 |
| T1.5 | 行业权威媒体 | 0.7 |
| T2 | 综合媒体 | 0.4 |
