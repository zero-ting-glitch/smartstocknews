# SmartStock - 智慧农业信息聚合站

> 智慧农业的新玩法，一个站看全球

聚焦智慧农业（IoT / AI / 自动化 / 机器人在种植业与养殖业的应用）的新闻聚合站。RSS 仅作为发现入口，实际爬取完整文章页面，由 AI 进行评分、翻译、摘要和推荐，以自定义排版重新展示。

## 功能特性

- **全文爬取**：RSS + 列表页发现链接 → cheerio 爬取完整文章（文本 + 图片 + 作者），403 时自动回退 Playwright headless browser 绕过 Cloudflare
- **统一 AI 处理**：单次 DeepSeek API 调用完成评分 / 全文翻译 / 摘要 / 精选理由
- **多维度评分**：相关性、重要性、新颖性、可读性、可操作性（0-100）
- **预筛过滤**：技术词+农业词双维度交叉匹配，过滤非农业技术文章
- **跨源去重**：标题 Jaccard 相似度去重，避免同一文章重复入库
- **物种频道**：猪业 / 禽业 / 牛业 / 羊业 / 大田 / 果蔬 / 园艺
- **详情页**：精选理由、AI 摘要、全文中文翻译（中英切换）、原文链接
- **信源分级**：T1（官方一手）/ T1.5（行业权威）/ T2（综合媒体）
- **自动采集**：GitHub Actions 每周一 08:07 自动 + 手动触发，自动导出静态 JSON

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS v4 + CSS 变量（亮色主题） |
| 数据库 | Prisma + SQLite（仅 CI 管线使用） |
| AI | DeepSeek API（openai SDK） |
| 爬虫 | cheerio（HTML 解析）、rss-parser（RSS）、Playwright + Stealth（绕过 Cloudflare） |
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
│   │   ├── SpeciesPage.tsx     # 物种频道通用页面
│   │   ├── RightPanel.tsx      # 右侧面板
│   │   └── StatsCard.tsx       # 统计卡片
│   └── lib/
│       ├── collector/          # 数据采集
│       │   ├── scraper.ts      # Web 爬虫（cheerio + Playwright 回退）+ SSRF 防护
│       │   ├── index.ts        # RSS 采集 + 聚合
│       │   ├── rss.ts          # RSS 解析
│       │   └── filter.ts       # 关键词过滤 + 去重
│       ├── processor/          # AI 处理
│       │   ├── scorer.ts       # AI 评分
│       │   ├── translator.ts   # AI 翻译
│       │   ├── calculator.ts   # 质量分计算
│       │   └── index.ts        # AI 处理入口
│       ├── sources.ts          # 信源配置加载
│       ├── db.ts               # Prisma 客户端
│       ├── config.ts           # 前端配置
│       └── utils.ts            # 工具函数
├── scripts/
│   ├── run-pipeline.ts         # 一键管线（同步→采集→日期修正→爬取→预筛→AI→物种修复→导出）
│   ├── export-static.ts        # 独立导出脚本
│   ├── cleanup-irrelevant.ts   # AI 语义清理不相关文章（一次性）
│   ├── seed-sources.ts         # 信源初始化
│   ├── check-items.ts          # 数据检查工具
│   └── clear-truncated.ts      # 清除截断翻译（一次性）
├── data/
│   └── sources.json            # 信源配置（15 个源）
├── prisma/
│   └── schema.prisma           # 数据库 schema
├── public/
│   ├── _headers                # 安全头配置
│   └── data/                   # 导出的静态 JSON
│       ├── items.json          # 全部列表数据
│       ├── items-{species}.json    # 按物种分类的列表
│       ├── items/{id}.json     # 每篇文章的详情 JSON（含全文+翻译）
│       ├── hot-items.json      # 热点数据
│       ├── hot-items-{species}.json # 按物种分类的热点
│       ├── item-ids.json       # 文章 ID 索引
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

`scripts/run-pipeline.ts` 一键运行 5+ 个步骤：

```
[1/5]   同步信源    sources.json → SQLite（upsert）
[2/5]   采集 URL    RSS + 列表页爬取 → 跨源标题去重 → 发现文章链接（403 时自动回退 headless browser）
[2.5]   修正日期    检测 publishedAt 与 scrapedAt 相差 < 5 分钟的文章，重置重新爬取
[3/5]   全文爬取    cheerio 解析 → 提取文本/图片/作者（域名级限速 2s，403 时回退 Playwright headless browser）
[3.5]   重评相关性  仅本轮新爬文章，用完整内容重新判断
[3.7]   智慧农业预筛 技术+农业双维度关键词匹配，阈值 ≥ 2
[4/5]   AI 处理     Stage 1 语义筛选 → Stage 2 评分+全文翻译+摘要+精选理由+物种分类
[4.5]   修复 species 将 subcategory 同步到 species 字段
[5/5]   导出 JSON   增量合并（已标记不相关的自动清除）+ 按分类导出 + 热点 + 统计
```

### 预筛过滤（Step 3.7）

AI 处理前进行关键词预筛，降低成本：
- 关键词分两组：`TECH_KEYWORDS`（技术）+ `AG_KEYWORDS`（农业）
- 必须每组至少命中 1 个，总命中 ≥ 2 才进入 AI 处理（阈值从 3 降到 2）
- 支持中英文关键词（覆盖 agri.cn 中文源）
- **歧义词处理**：对多义词（如 `layer`、`traceability`）维护负面上下文正则列表，匹配负面模式时排除
- **短词边界匹配**：长度 ≤ 5 的关键词使用 `\b` 词边界匹配，避免子串误匹配
- 被拒 item 标记 `isRelevant: false, techTags: 'pre_filter_rejected'`

### AI 处理（Step 4）

两级处理，节省 token：

- **Stage 1 语义筛选**：轻量 API 调用（title + 前 1500 字，max_tokens=200），判断是否与智慧农业/畜牧语义相关。API 失败时默认通过。
- **Stage 2 完整分析**：仅筛选通过的文章进入：
  - 五维评分（relevance / importance / novelty / readability / actionability）
  - 中文标题和摘要（100-150 字）
  - 全文中文翻译（完整翻译所有段落）
  - 精选理由（1-2 句推荐语）
  - 物种分类（pig / poultry / cattle / sheep / field / fruit / horticulture / general）

最终质量分 = 五维平均分 × 信源权重 + 多源验证加分

## 信源体系

### 当前 26 个信源

**种植/综合信源（9 个）**

| 信源 | 方向 | 采集方式 | 等级 |
|------|------|----------|------|
| PrecisionAg | 精准农业 | RSS | T1 |
| Future Farming | 农业机器人/自动化 | RSS | T1 |
| Global Ag Tech Initiative | 农业科技创新 | RSS | T1 |
| Greenhouse Grower | 温室/设施农业 | RSS | T1.5 |
| Fresh Plaza | 农产品供应链 | RSS | T2 |
| AgFunderNews | 农业科技投资 | 列表页 | T1 |
| Agri-Pulse | 农业政策+技术 | 列表页 | T1 |
| 中国农业农村信息网-智慧农业 | 中国智慧农业 | 列表页 | T1 |
| 中国农业农村信息网-信息化 | 中国农业信息化 | 列表页 | T1 |

**畜牧信源（17 个）**

| 信源 | 方向 | 采集方式 | 等级 |
|------|------|----------|------|
| National Hog Farmer | 养猪技术 | RSS | T1.5 |
| Pork.org | 猪业协会 | RSS | T1 |
| Beef Magazine | 肉牛养殖 | RSS | T1.5 |
| Poultry Times | 禽业 | RSS | T1.5 |
| MEAT+POULTRY | 肉禽加工 | RSS | T1.5 |
| Feedstuffs | 饲料营养 | RSS | T1.5 |
| The Pig Site | 养猪技术 | RSS | T1.5 |
| The Cattle Site | 养牛技术 | RSS | T1.5 |
| The Poultry Site | 养禽技术 | RSS | T1.5 |
| Pig Progress | 养猪进展 | RSS | T1.5 |
| Poultry World | 全球禽业 | RSS | T1.5 |
| Nedap | 畜牧物联网设备 | RSS | T1 |
| Lely | 挤奶/饲喂机器人 | RSS | T1 |
| DeLaval | 牧场自动化设备 | RSS | T1 |
| 中国畜牧业协会 | 中国畜牧政策/行业 | RSS | T1 |
| 中科智牧 | 中国智慧畜牧 | RSS | T1.5 |
| 精讯畅通 | 农业物联网设备 | RSS | T1.5 |

### 信源配置

信源配置在 `data/sources.json`，支持两种采集方式：

- **RSS**：设置 `rssUrl`，管线自动解析 feed
- **列表页爬取**：设置 `scrapeType: "listing_page"` + `listUrl` + `scrapeConfig`（CSS 选择器）

## 部署

### 自动部署

- Push to `master` → GitHub Actions 自动构建 → 部署到 GitHub Pages
- 手动触发采集（或每周一 08:07 自动）：GitHub Actions → "采集 + AI处理 + 导出" → Run workflow

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
