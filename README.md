# SmartStock - 智慧畜牧信息聚合站

> 智慧畜牧的新玩法，一个站看全球

聚焦智慧畜牧（IoT / AI / 自动化 / 机器人在养殖业和种植业的应用）的新闻聚合站。RSS 仅作为发现入口，实际爬取完整文章页面，由 AI 进行评分、翻译、摘要和推荐，以自定义排版重新展示。

## 功能特性

- **全文爬取**：RSS + 列表页发现链接 → cheerio 爬取完整文章（文本 + 图片 + 作者）
- **统一 AI 处理**：单次 DeepSeek API 调用完成评分 / 翻译 / 摘要 / 精选理由
- **多维度评分**：相关性、重要性、新颖性、可读性、可操作性（0-100）
- **物种频道**：猪业 / 禽业 / 牛业 / 羊业 / 大田 / 果蔬 / 园艺
- **详情页**：AIHOT 风格排版 — 精选理由、AI 摘要、中英切换、原文链接
- **信源分级**：T1（官方一手）/ T1.5（行业权威）/ T2（综合媒体）
- **自动采集**：GitHub Actions 每 6 小时运行，自动导出静态 JSON

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS v4 + CSS 变量（亮色主题） |
| 数据库 | Prisma + SQLite（仅 CI 管线使用） |
| AI | DeepSeek API（openai SDK） |
| 爬虫 | cheerio（HTML 解析）、rss-parser（RSS） |
| 部署 | GitHub Pages（静态导出 `output: 'export'`） |
| CI/CD | GitHub Actions |

## 目录结构

```
smartstock/
├── src/
│   ├── app/                    # Next.js 页面
│   │   ├── page.tsx            # 主页（时间线）
│   │   ├── detail/page.tsx     # 文章详情页
│   │   ├── pig/                # 猪业频道
│   │   ├── poultry/            # 禽业频道
│   │   ├── cattle/             # 牛业频道
│   │   ├── sheep/              # 羊业频道
│   │   ├── field/              # 大田频道
│   │   ├── fruit/              # 果蔬频道
│   │   ├── horticulture/       # 园艺频道
│   │   ├── all/                # 全部动态
│   │   └── about/              # 关于页面
│   ├── components/
│   │   ├── Sidebar.tsx         # 侧边栏导航
│   │   ├── Timeline.tsx        # 时间线组件
│   │   ├── NewsCard.tsx        # 新闻卡片
│   │   ├── HotCard.tsx         # 热点卡片
│   │   └── FilterChips.tsx     # 筛选标签
│   └── lib/
│       ├── collector/          # 数据采集
│       │   ├── scraper.ts      # Web 爬虫（cheerio）
│       │   └── index.ts        # RSS 采集 + 聚合
│       ├── processor/          # AI 处理
│       │   ├── scorer.ts       # AI 评分
│       │   ├── translator.ts   # AI 翻译
│       │   └── calculator.ts   # 质量分计算
│       ├── db.ts               # Prisma 客户端
│       ├── config.ts           # 前端配置
│       └── utils.ts            # 工具函数
├── scripts/
│   ├── run-pipeline.ts         # 一键管线（采集→爬取→AI→导出）
│   ├── export-static.ts        # 静态 JSON 导出
│   └── seed-sources.ts         # 信源初始化
├── data/
│   └── sources.json            # 信源配置（12 个源）
├── prisma/
│   └── schema.prisma           # 数据库 schema
├── public/
│   ├── _headers                # 安全头配置
│   └── data/                   # 导出的静态 JSON
│       ├── items.json          # 列表数据
│       ├── items/{id}.json     # 详情数据（每篇一个文件）
│       ├── hot-items.json      # 热点数据
│       └── stats.json          # 统计数据
├── .github/workflows/
│   ├── deploy.yml              # 部署工作流
│   └── collect.yml             # 采集工作流
└── .env.example                # 环境变量模板
```

## 快速开始

### 环境要求

- Node.js 22+
- npm

### 安装

```bash
git clone https://github.com/zero-ting-glitch/smartstocknews.git
cd smartstocknews
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env，填入 DeepSeek API Key
```

### 本地开发

```bash
npm run dev
# 访问 http://localhost:3000/smartstocknews/
```

### 运行数据管线

```bash
# 初始化数据库
npx prisma generate
npx prisma db push

# 运行完整管线：采集 → 爬取 → AI处理 → 导出JSON
npx tsx scripts/run-pipeline.ts
```

### 构建

```bash
npm run build
# 静态文件输出到 out/ 目录
```

## 数据管线

`scripts/run-pipeline.ts` 一键运行 5 个步骤：

```
[1/5] 同步信源    → sources.json → SQLite
[2/5] 采集 URL    → RSS + 列表页爬取 → 发现文章链接
[3/5] 全文爬取    → cheerio 解析 → 提取文本/图片/作者
[4/5] AI 处理     → DeepSeek 统一调用 → 评分+翻译+摘要+精选理由
[5/5] 导出 JSON   → 列表 JSON + 详情 JSON + 热点 + 统计
```

### AI 处理

单次 API 调用返回：
- 五维评分（relevance / importance / novelty / readability / actionability）
- 中文标题和摘要
- 精选理由（1-2 句推荐语）

最终质量分 = 五维平均分 × 信源权重 + 多源验证加分

## 信源体系

### 当前 12 个信源

| 信源 | 物种 | 类型 | 优先级 |
|------|------|------|--------|
| PrecisionAg | 综合 | 列表页爬取 | T1 |
| Beef Magazine | 牛业 | RSS | T1.5 |
| National Hog Farmer | 猪业 | RSS | T1.5 |
| Pork.org | 猪业 | RSS | T1 |
| Poultry Times | 禽业 | RSS | T1.5 |
| MEAT+POULTRY | 禽业 | RSS | T1.5 |
| Feedstuffs | 综合 | RSS | T1.5 |
| Farm Progress | 综合 | RSS | T2 |
| Greenhouse Grower | 园艺 | RSS | T1.5 |
| Fresh Plaza | 果蔬 | RSS | T1.5 |
| AgFunderNews | 综合 | 列表页爬取 | T1 |
| Agri-Pulse | 综合 | 列表页爬取 | T1 |

### 信源配置

信源配置在 `data/sources.json`，支持两种采集方式：

- **RSS**：设置 `rssUrl`，管线自动解析 feed
- **列表页爬取**：设置 `scrapeType: "listing_page"` + `listUrl` + `scrapeConfig`（CSS 选择器）

## 部署

### 自动部署

- Push to `master` → GitHub Actions 自动构建 → 部署到 GitHub Pages
- 手动触发采集：GitHub Actions → "采集 + AI处理 + 导出" → Run workflow

### 线上地址

https://zero-ting-glitch.github.io/smartstocknews/

## 安全

- SSRF 防护：URL 协议校验 + 私有 IP 拦截 + DNS 解析后 IP 校验
- XSS 防护：React 自动转义 + 外链协议校验 + contentHtml 净化
- 安全头：CSP、X-Frame-Options: DENY、X-Content-Type-Options: nosniff
- GitHub Actions：全部 action 锁定到 commit SHA
- 密钥管理：API Key 仅通过环境变量 / GitHub Secrets 传递，不进代码

## License

Private - 仅限个人使用
