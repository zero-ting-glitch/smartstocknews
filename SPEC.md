# SmartStock 需求规格说明书

## 1. 产品概述

- **名称**：SmartStock
- **定位**：智慧农业信息聚合站，聚焦技术应用、新模式、新玩法
- **Slogan**：智慧农业的新玩法，一个站看全球
- **参考**：AIHOT (aihot.virxact.com)
- **部署**：GitHub Pages（静态导出）

## 2. 内容边界

### 做
- IoT、AI、自动化、精准饲喂、环境监控、数字孪生、溯源、机器人、可穿戴设备等技术在**养殖业**的应用
- 同类技术在**种植业**（大田、果蔬、园艺/温室）的应用

### 不做
- 行情价格、单纯疫病防治、非技术类新闻

## 3. 频道体系

### 物种频道

| 频道 | 路径 | 说明 |
|------|------|------|
| 主页 | `/` | 今日热点 + 精选时间线 |
| 猪业 | `/pig` | 猪业智养频道 |
| 禽业 | `/poultry` | 禽业智养频道 |
| 牛业 | `/cattle` | 牛业智养频道 |
| 羊业 | `/sheep` | 羊业智养频道 |
| 大田 | `/field` | 大田作物（玉米/小麦/大豆/水稻） |
| 果蔬 | `/fruit` | 果蔬种植 |
| 园艺 | `/horticulture` | 温室/花卉/苗圃 |
| 全部 | `/all` | 全部动态（多维筛选） |
| 详情 | `/detail?id=xxx` | 文章详情页 |
| 关于 | `/about` | 关于页面 |

## 4. 信源体系

### 分级

| 等级 | 定义 | 权重 |
|------|------|------|
| T1 | 官方/学术一手 | 1.0 |
| T1.5 | 行业权威媒体 | 0.7 |
| T2 | 综合媒体/KOL | 0.4 |

### 当前 26 个信源

**种植/综合信源（9 个）**

| 信源 | 物种 | 采集方式 | 等级 |
|------|------|----------|------|
| PrecisionAg | 综合 | RSS | T1 |
| Future Farming | 综合 | RSS | T1 |
| Global Ag Tech Initiative | 综合 | RSS | T1 |
| Greenhouse Grower | 园艺 | RSS | T1.5 |
| Fresh Plaza | 果蔬 | RSS | T2 |
| AgFunderNews | 综合 | 列表页爬取 | T1 |
| Agri-Pulse | 综合 | 列表页爬取 | T1 |
| 中国农业农村信息网-智慧农业 | 综合 | 列表页爬取 | T1 |
| 中国农业农村信息网-信息化 | 综合 | 列表页爬取 | T1 |

**畜牧信源（17 个）**

| 信源 | 物种 | 采集方式 | 等级 |
|------|------|----------|------|
| National Hog Farmer | 猪业 | RSS | T1.5 |
| Pork.org | 猪业 | RSS | T1 |
| Beef Magazine | 牛业 | RSS | T1.5 |
| Poultry Times | 禽业 | RSS | T1.5 |
| MEAT+POULTRY | 禽业 | RSS | T1.5 |
| Feedstuffs | 综合 | RSS | T1.5 |
| The Pig Site | 猪业 | RSS | T1.5 |
| The Cattle Site | 牛业 | RSS | T1.5 |
| The Poultry Site | 禽业 | RSS | T1.5 |
| Pig Progress | 猪业 | RSS | T1.5 |
| Poultry World | 禽业 | RSS | T1.5 |
| Nedap | 综合 | RSS | T1 |
| Lely | 综合 | RSS | T1 |
| DeLaval | 综合 | RSS | T1 |
| 中国畜牧业协会 | 综合 | RSS | T1 |
| 中科智牧 | 综合 | RSS | T1.5 |
| 精讯畅通 | 综合 | RSS | T1.5 |

### 采集方式

- **RSS**：配置 `rssUrl`，管线用 rss-parser 解析（403 时自动回退 Playwright headless browser 获取 XML）
- **列表页爬取**：配置 `scrapeType: "listing_page"` + `listUrl` + `scrapeConfig`（CSS 选择器），cheerio 爬取（403 时回退 Playwright）
- **反爬绕过**：Playwright + Stealth 插件，绕过 Cloudflare TLS 指纹 + JS challenge

### 过滤策略（三层）

1. **信源级别**：`sources.json` 各信源配置 `coreKeywords`，标题命中任一关键词即通过
2. **管线预筛（Step 3.7）**：技术词 + 农业词双维度交叉匹配，每组至少 1 个，总命中 ≥ 2；包含歧义词处理 + 短词边界匹配；不通过标记 `pre_filter_rejected`
3. **AI 语义筛选（Step 4 Stage 1）**：轻量 API 判断是否与智慧农业/畜牧语义相关；不通过标记 `ai_rejected`，DB 保留但不导出

## 5. 数据处理流程

### 管线步骤

```
[1/5]   同步信源    sources.json → SQLite Source 表（upsert）
[2/5]   采集 URL    RSS 解析 + 列表页爬取 → 发现文章链接 → 关键词过滤 → Item 表（403 时自动回退浏览器）
[2.5]   修正日期    检测 publishedAt 与 scrapedAt 相差 < 5 分钟的文章，重置重新爬取
[3/5]   全文爬取    cheerio 解析每篇文章 → 提取文本/图片/作者/发表日期 → 写入 contentFull/images/author（403 时回退 Playwright）
[3.5]   重评相关性  仅本轮新爬文章，用完整内容重新判断
[3.7]   智慧农业预筛 技术+农业双维度关键词匹配，阈值 ≥ 2（歧义词处理 + 短词边界匹配）
[4/5]   AI 处理     Stage 1 语义筛选 → Stage 2 五维评分+中文标题+摘要+全文翻译+精选理由+物种分类
[4.5]   修复 species 将 subcategory 同步到 species 字段
[5/5]   导出 JSON   增量合并（已标记不相关的自动清除）+ 列表 JSON + 详情 JSON + 热点 JSON + 统计 JSON
```

### AI 评分维度

| 维度 | 说明 | 范围 |
|------|------|------|
| relevance | 与智慧畜牧（IoT/AI/自动化）的关联度 | 0-100 |
| importance | 对行业的影响程度 | 0-100 |
| novelty | 技术新颖性和创新程度 | 0-100 |
| readability | 内容可读性和信息密度 | 0-100 |
| actionability | 可操作性和实践参考价值 | 0-100 |

### 质量分计算

```
qualityScore = 五维平均分 × 信源权重 + min(多源数, 3) × 5
```

- `isHot`：qualityScore >= 75 或 multiSourceCount >= 3
- `isFeatured`：按信源等级分级，T1 >= 60，T1.5 >= 70，T2 >= 80

## 6. 数据模型

### Source 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| name | String | 英文名 |
| nameZh | String | 中文名 |
| url | String | 网站地址 |
| rssUrl | String? | RSS 地址 |
| tier | String | T1 / T1.5 / T2 |
| species | String | 物种 |
| category | String | 分类 |
| scrapeType | String | "rss" / "listing_page" |
| listUrl | String? | 列表页 URL |
| scrapeConfig | String? | CSS 选择器配置（JSON） |
| isActive | Boolean | 是否启用 |
| lastFetched | DateTime? | 上次采集时间 |

### Item 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| sourceId | String | 外键 |
| titleEn | String | 英文原标题 |
| url | String | 原文链接（唯一） |
| publishedAt | DateTime? | 发布时间（可能为 null） |
| contentHtml | String? | 原文 HTML |
| contentFull | String? | 纯文本全文（max ~10000 chars） |
| images | String? | 图片 URL 数组（JSON） |
| author | String? | 作者 |
| titleZh | String? | 中文标题 |
| summaryZh | String? | 中文摘要（150 字） |
| featuredReason | String? | 精选理由（1-2 句） |
| species | String | 物种标签 |
| category | String? | livestock / crop / aggtech |
| subcategory | String? | pig/poultry/cattle/sheep/field/fruit/horticulture/general |
| techTags | String | 技术标签（逗号分隔） |
| isRelevant | Boolean | 是否与智慧畜牧相关 |
| isHot | Boolean | 是否热点 |
| qualityScore | Float | 质量分 |
| aiScores | String? | AI 五维分数（JSON） |
| multiSourceCount | Int | 多源报道数 |
| scrapedAt | DateTime? | 全文爬取时间 |
| scrapeMethod | String? | rss / web_scrape |

### Feedback 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| itemId | String | 外键 |
| rating | String | "up" / "down" |
| createdAt | DateTime | 创建时间 |

## 7. 前端设计

### 布局

- 三栏：侧边栏(180px) + 时间线(flex-1) + 右侧面板(300px)
- 侧边栏 `position: sticky`
- 按日期分组的时间线
- 响应式：手机隐藏侧边栏

### 新闻卡片

- 双语标题（中文翻译 + 英文原标题）
- 来源 + 等级 + 物种标签 + 精选标记 + 质量分
- 精选理由 / AI 推荐理由
- 链接到详情页 `/detail?id=xxx`

### 详情页

```
← 返回
[来源] [T1] [76] [精选]
中文标题
English Title
作者 · 日期 · 物种标签
━━ 精选理由（黄色背景）━━
━━ AI 摘要（蓝色背景）━━
━━ AI 翻译 / 原文切换 ━━
[文章图片]
[技术标签]
[阅读原文 →]
```

### 主题配色（亮色）

```css
--bg-main: #f8fafc;
--bg-surface: #ffffff;
--accent: #16a34a;
--text-primary: #1e293b;
--text-secondary: #64748b;
```

## 8. 安全

- SSRF 防护：URL 协议校验 + 私有 IP/IPv6/CGNAT 拦截 + DNS 解析后 IP 校验
- XSS 防护：React 自动转义 + 外链协议校验 + contentHtml 净化
- 安全头：CSP、X-Frame-Options: DENY、X-Content-Type-Options: nosniff
- GitHub Actions 全部锁定到 commit SHA
- API Key 仅通过环境变量传递

## 9. 环境变量

```bash
DATABASE_URL="file:./dev.db"
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
ADMIN_TOKEN=xxx
```

## 10. 部署

- 静态导出：`npm run build` → `out/` 目录
- GitHub Pages：push to master 自动构建部署
- 采集：GitHub Actions 手动触发，运行管线后自动提交数据变更
- Secret：`CFG_01`（DeepSeek API Key）
