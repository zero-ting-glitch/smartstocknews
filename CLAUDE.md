# SmartStock - 智慧农业信息聚合站

## 项目简介

聚焦智慧农业（IoT/AI/自动化/机器人在种植业与养殖业的应用）的新闻聚合站。中海外信源结合，按物种/作物细分频道。RSS 仅作发现入口，实际爬取完整文章页面，AI 评分、全文翻译后以自定义排版展示。参考 AIHOT (aihot.virxact.com) 设计。

## 目录结构

```
smartstock/
├── src/
│   ├── app/               # Next.js App Router 页面
│   │   ├── page.tsx       # 主页（时间线）
│   │   ├── detail/        # 文章详情页（query param 路由）
│   │   ├── pig|poultry|cattle|sheep/  # 畜种频道
│   │   ├── field|fruit|horticulture/   # 作物频道
│   │   ├── general/       # 综合资讯频道
│   │   ├── all/           # 全部动态
│   │   └── about/         # 关于页面
│   ├── components/        # React 组件
│   │   ├── Sidebar.tsx    # 侧边栏导航
│   │   ├── Timeline.tsx   # 时间线
│   │   ├── NewsCard.tsx   # 新闻卡片（链接到详情页）
│   │   ├── HotCard.tsx    # 热点卡片
│   │   ├── SpeciesPage.tsx    # 物种频道通用页面
│   │   ├── RightPanel.tsx     # 右侧面板
│   │   ├── StatsCard.tsx      # 统计卡片
│   │   └── BackToTop.tsx      # 回到顶部按钮
│   └── lib/
│       ├── collector/     # 数据采集
│       │   ├── scraper.ts # Web 爬虫（cheerio + Playwright 回退）+ SSRF 防护
│       │   ├── index.ts   # RSS 采集 + 聚合
│       │   ├── rss.ts     # RSS 解析
│       │   └── filter.ts  # 关键词过滤 + 去重
│       ├── processor/     # AI 处理
│       │   ├── scorer.ts  # AI 评分（五维）
│       │   ├── translator.ts  # AI 翻译
│       │   ├── calculator.ts  # 质量分计算
│       │   └── index.ts   # AI 处理入口
│       ├── sources.ts     # 信源配置加载
│       ├── db.ts          # Prisma 客户端单例
│       ├── config.ts      # BASE_PATH 等前端配置
│       └── utils.ts       # formatTime, speciesNames, speciesColors
├── scripts/
│   ├── run-pipeline.ts    # 一键管线（5+步：同步→采集→修正日期→爬取→AI→修正物种→导出）
│   ├── export-static.ts   # 独立导出脚本
│   ├── cleanup-irrelevant.ts # 一次性：AI 语义清理现有文章中不相关的
│   ├── seed-sources.ts    # 信源初始化
│   ├── check-items.ts     # 数据检查工具
│   └── clear-truncated.ts # 清除截断翻译（一次性工具）
├── data/sources.json      # 26 个信源配置（9 种植/综合 + 17 畜牧）
├── prisma/schema.prisma   # 数据库 schema
├── public/
│   ├── _headers           # 安全头（CSP 等）
│   └── data/              # 导出的静态 JSON
├── .github/workflows/
│   ├── deploy.yml         # push to master → 构建 → GitHub Pages
│   └── collect.yml        # 每周一 08:07 自动 + 手动触发 → 采集+AI+导出 → 自动提交
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
- DeepSeek API（统一调用评分+全文翻译+摘要+精选理由）
- cheerio（HTML 解析，全文爬取）
- rss-parser（RSS feed 解析）
- Playwright + Stealth 插件（Headless Browser，绕过 Cloudflare 反爬）
- Jina Reader API / Google Cache / Wayback Machine（全文抓取多层回退）
- 部署：GitHub Pages + GitHub Actions CI/CD

## 数据管线

```
[1/5] 同步信源      sources.json → SQLite（upsert）
[2/5] 采集 URL      RSS 解析 + 列表页爬取 → 跨源标题去重 → 发现文章链接
                    RSS/列表页 403 时自动回退 headless browser
[2.5] 修正日期      检测 publishedAt 与 scrapedAt 相差 < 5 分钟的文章，重置重新爬取
[3/5] 全文爬取      cheerio 解析 → 提取文本/图片/作者/发表日期（已爬过跳过）
                    域名级限速（2s 间隔）防 429，403 时自动回退 Playwright headless browser
[3.5] 重评相关性    增量执行：仅本轮新爬文章，用完整内容重新判断（不再全表扫描）
[3.7] 智慧农业预筛  增量执行：仅本轮新爬文章，技术+农业双维度关键词匹配，阈值 ≥ 2（详见下方）
[4/5] AI 处理       两级处理：Stage 1 语义筛选 → Stage 2 完整评分+翻译+物种分类（详见下方）
[4.5] 修复 species  将 subcategory 同步到 species 字段
[5/5] 导出 JSON     增量合并（旧数据保留，但已标记不相关的自动清除） → 清理孤立 detail 文件 → items.json + items/{id}.json + hot-items(5条) + stats.json + 按分类导出
```

### 翻译完整度保障

- `max_tokens: 16000`（DeepSeek-V3 上限），覆盖绝大多数长文章
- Prompt 要求"完整翻译所有段落，不得截断"
- **截断续翻**：翻译以 `……`/`......` 结尾时，自动定位原文断点，翻译剩余部分拼接
- **截断清理**：Step 4 前置清除 < 200 字的明显废翻译（以省略号结尾），让管线重新生成
- 详情页翻译支持 `**加粗**` markdown 语法渲染

### 发表时间修正

- RSS/列表页不再用 `new Date()` 作 publishedAt fallback，改为 null
- Step 3 爬虫提取真实发表日期（`extractDate`：time[datetime]、meta[property="article:published_time"] 等）
- Step 2.5 自动检测日期可疑文章（publishedAt 与 scrapedAt 相差 < 5 分钟），重置重新爬取
- 前端适配 null 日期：formatTime 显示 `--:--`，Timeline 归入"其他"组

### 预筛过滤（Step 3.7）

- 关键词分两组：`TECH_KEYWORDS`（技术）+ `AG_KEYWORDS`（农业）
- 必须每组至少命中 1 个，总命中 ≥ 2 才进入 AI 处理（阈值从 3 降到 2，允许边缘情况通过）
- 支持中英文关键词（覆盖 agri.cn 中文源）
- 被拒 item 标记 `isRelevant: false, techTags: 'pre_filter_rejected'`
- **歧义词处理**（`AMBIGUOUS_KWS`）：对多义词（如 `layer`、`traceability`）维护负面上下文正则列表，命中歧义词时检查是否匹配负面模式（如 "supply chain layers"、"visit our traceability page"），匹配则排除
- **短词边界匹配**：长度 ≤ 5 的关键词使用 `\b` 词边界匹配，避免子串误匹配（如 `iot` 不匹配 `riot`）

### AI 语义筛选（Step 4 内置）

预筛（关键词匹配）通过的文章，仍可能语义上不相关。在 AI 完整处理前增加一级轻量语义筛选：

- **Stage 1 筛选**：轻量 API 调用（title + 前 1500 字，max_tokens=200），判断是否与智慧农业/畜牧语义相关
- **Stage 2 完整分析**：仅筛选通过的文章进入五维评分 + 全文翻译 + 摘要 + 精选理由
- 筛选失败标记 `isRelevant: false, techTags: 'ai_rejected'`，DB 保留但不导出（前端完全不可见）
- API 失败时默认通过，避免意外丢失文章

**筛选 prompt 设计要点**：
- "相关"示例覆盖畜牧科技（自动饲喂、机器人挤奶、育种基因、健康监测、疾病检测等）和种植科技（精准农业、无人机、温室自动化等），避免偏科
- "不相关"范围精准，不误杀畜牧技术文章（如 meat processing 涉及 automation 应保留）
- Stage 1 不通过则不调用 Stage 2，节省 token（被拒文章只消耗 ~200 token）

### AI 分类（Step 4 内置）

`analyzeItem` 的 prompt 要求 AI 将文章归入 8 个 subcategory 之一：

- **强制分类原则**："不要轻易选 general"，仅当确属多品类或完全无法归入时才选
- 畜牧业细分：pig / poultry / cattle / sheep
- 种植业细分：field / fruit / horticulture
- 兜底：general（综合/跨领域）
- 分类不精准时，可通过优化 prompt 中各类别的示例描述来改进

### 跨源标题去重（Step 2 内置）

- 标题归一化后计算 Jaccard 相似度
- 相似度 ≥ 0.6 视为重复，跳过入库
- 防止同一文章在多个信源重复出现

### 爬虫选择器

默认选择器按优先级尝试（第一个匹配 > 200 字的生效）：
`article .entry-content` → `article .post-content` → `.article-body` → `.story-body` → `.article-content` → `.article-page` → `.post-body` → `.entry-content` → `.post-content` → `article` → `main`

特殊站点可在 `sources.json` 的 `scrapeConfig` 中配置 `contentSelector`、`dateSelector`、`authorSelector` 等。

**爬虫反封措施（5 层回退链）**：
1. **直接 fetch**：Chrome UA + 完整浏览器特征头（Sec-Fetch-*, Accept-Encoding 等），绕过基础 bot 检测
2. **Playwright + Stealth**：fetch 失败时自动回退到 headless browser（真正的 Chrome，绕过 Cloudflare TLS 指纹 + JS challenge）
3. **Jina Reader**：`r.jina.ai/URL`，第三方全文提取服务，自带反爬
4. **Google Cache**：`webcache.googleusercontent.com`，谷歌缓存版本
5. **Wayback Machine**：`web.archive.org`，互联网档案馆存档

- 域名级限速（`DOMAIN_DELAY_MS = 2000ms`），同一域名请求间隔 ≥ 2 秒防 429
- 浏览器懒加载单例，管线结束自动关闭；RSS 解析失败时也走浏览器回退
- 任何一层成功即跳过后续层，日志标注使用了哪种方式

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
npx tsx scripts/run-pipeline.ts           # 运行完整管线
npx tsx scripts/clear-truncated.ts        # 清除截断翻译（一次性）
npx tsx scripts/cleanup-irrelevant.ts     # AI 语义清理现有文章（一次性，需 DEEPSEEK_API_KEY）
npx tsx scripts/export-static.ts          # 独立导出静态 JSON
```

## 部署

- 线上地址：https://zero-ting-glitch.github.io/smartstocknews/
- GitHub 仓库：https://github.com/zero-ting-glitch/smartstocknews
- 推送到 master 自动触发构建和部署
- 采集工作流：GitHub Actions 每周一 08:07 自动运行 + 手动触发，运行管线后自动提交 `public/data/` 的变更
- Secret 名称：`CFG_01`（DeepSeek API Key）

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
| 综合 | `/general` | general |

## 信源体系

26 个信源配置（9 种植/综合 + 17 畜牧），分 RSS 和列表页爬取两种方式。配置在 `data/sources.json`。

| 等级 | 定义 | 质量分权重 |
|------|------|-----------|
| T1 | 官方一手/学术 | 1.0 |
| T1.5 | 行业权威媒体 | 0.7 |
| T2 | 综合媒体 | 0.4 |

**种植/综合信源（9 个）**：precisionagriculture、agfundernews、futurefarming、freshplaza、agri.cn（3 个中文源）、thepigsite、world-agriculture、agriculture

**畜牧信源（17 个）**：
- 传统行业媒体（6）：nationalhogfarmer、porkorg、beefmagazine、poultrytimes、meatpoultry、feedstuffs
- 行业技术媒体（5）：thepigsite、thecattlesite、thepoultrysite、pigprogress、poultryworld
- 设备厂商（3）：nedap、lely、delaval
- 中文信源（3）：caaa（中国畜牧业协会）、zkzhimu（中科智牧）、jxct（精讯畅通）

**Cloudflare 封锁说明**：farmprogress 系（nationalhogfarmer、beefmagazine、poultrytimes、meatpoultry）及 feedstuffs、agfundernews 等站点被 Cloudflare 封锁。管线通过 Playwright + Stealth 插件（headless browser）自动回退绕过，403 时启动真实 Chrome 获取内容。feedstuffs 的 RSS XML 不规范（含 HTML 实体），目前仍无法解析。

## 详情页

- 路由：`/detail?id={articleId}`（静态导出，query param 路由）
- 翻译卡片显示条件：`contentFull` 或 `translationZh` 存在即显示
- 翻译中 `**加粗**` 语法渲染为实际粗体
- 有原文时可切换"显示中文"/"显示原文"；无原文时只显示翻译
- 发表时间：优先显示爬虫提取的真实日期，null 时不显示
- 数据来源：`public/data/items/{id}.json`（导出时含 contentFull、translationZh、images 等）

## 备选

- **更名待定**：`SmartFarm` 为备选站名（覆盖种植+养殖，更准确），暂不改动
