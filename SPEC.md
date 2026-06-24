# SmartStock 需求规格说明书

## 1. 产品概述

**名称**：SmartStock
**定位**：智慧畜牧信息聚合站，聚焦技术应用、新模式、新玩法
**Slogan**：智慧畜牧的新玩法，一个站看全球
**部署**：Vercel 免费层

## 2. 内容边界

### 做
- IoT、AI、自动化、精准饲喂、环境监控、数字孪生、溯源、机器人、可穿戴设备等技术在养殖业的应用

### 不做
- 行情价格、单纯疫病防治、种植业内容

## 3. 物种频道

| 频道 | 路径 | 说明 |
|------|------|------|
| 主页 | `/` | 今日热点 + 精选时间线 |
| 猪业 | `/pig` | 猪业智养频道 |
| 禽业 | `/poultry` | 禽业智养频道 |
| 牛业 | `/cattle` | 牛业智养频道 |
| 羊业 | `/sheep` | 羊业智养频道 |
| 全部 | `/all` | 全部动态（多维筛选） |
| 关于 | `/about` | 关于页面 |

## 4. 信源体系

### 分级

| 等级 | 定义 | 权重 |
|------|------|------|
| T1 | 官方/学术一手 | 1.0 |
| T1.5 | 行业权威媒体 | 0.7 |
| T2 | 综合媒体/KOL | 0.4 |

### 核心信源（海外为主）

**综合智慧农业**：AgFunder News、PrecisionAg、Smart Farming Magazine
**猪业**：The Pig Site、PigProgress、National Hog Farmer
**禽业**：The Poultry Site、WATTAgNet、Poultry World
**牛业**：The Cattle Site、Dairy Herd Management、Hoard's Dairyman、Beef Magazine
**学术**：Computers and Electronics in Agriculture、Smart Agricultural Technology、Sensors (MDPI)

### 过滤策略

1. 信源白名单制
2. 关键词黑名单过滤内容农场
3. 标题相似度 > 0.8 去重
4. 两层过滤：关键词匹配 + 便宜模型预筛

## 5. 数据处理流程

### 三阶段处理

```
Stage 1: 采集+预筛
  RSS/HTML采集 → 关键词匹配 → DeepSeek V3.2预筛 → 相关条目

Stage 2: 评分+翻译（并行）
  AI评分 (DeepSeek V4 Pro) → 5维度分数
  翻译 (DeepSeek V3.2) → 中文标题+摘要

Stage 3: 代码计算
  5维度分数 + 信源权重 + 多源验证 → 最终质量分 → 精选/落库
```

### AI 评分维度

| 维度 | 说明 | 范围 |
|------|------|------|
| relevance | 与智慧畜牧的关联度 | 0-100 |
| importance | 对行业的影响程度 | 0-100 |
| novelty | 是否是新东西 | 0-100 |
| readability | 内容质量 | 0-100 |
| actionability | 能否指导实践 | 0-100 |

### 精选阈值

- T1：60分
- T1.5：70分
- T2：80分

## 6. 前端设计

### 布局

- 三栏布局：侧边栏(180px) + 时间线(flex-1) + 右侧面板(300px)
- 侧边栏 position: sticky
- 按日期分组的时间线
- 响应式：手机隐藏侧边栏，平板收起为图标

### 新闻卡片

- 双语标题（英文原标题 + 中文翻译）
- 来源 + 等级标签 + 物种标签 + 技术标签
- 相对时间
- AI 生成中文摘要（150字内）

### 今日热点

- TOP 5 热点新闻
- 排名 + 标题 + 来源数 + 时间

### 主题配色（暗色）

```css
--bg-deep: #060814;
--bg-main: #0b0f1a;
--bg-surface: #111827;
--accent: #22d3ee;
--text-primary: #f1f5f9;
--text-secondary: #94a3b8;
--text-muted: #64748b;
```

## 7. 数据库

### Source 表

- id, name, nameZh, url, rssUrl, tier, species[], category, isActive, lastFetched

### Item 表

- id, sourceId, titleEn, url, publishedAt, contentHtml
- titleZh, summaryZh, species[], techTags[], isRelevant
- isHot, qualityScore, aiScores, multiSourceCount

### Feedback 表

- id, itemId, rating("up"/"down"), createdAt

## 8. API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/collect` | POST | 手动触发采集（需 ADMIN_TOKEN） |
| `/api/items` | GET | 查询新闻列表 |
| `/api/stats` | GET | 信源统计 |
| `/api/feedback` | POST | 用户反馈 |

## 9. 环境变量

```bash
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DATABASE_URL=file:./dev.db
ADMIN_TOKEN=xxx
```

## 10. 开发阶段

### Phase 1：基础框架（Day 1-2）
- 初始化 Next.js 项目
- 搭建页面结构
- 暗色主题 + 响应式布局
- 核心组件

### Phase 2：数据采集（Day 3-4）
- RSS 采集器
- 信源配置
- 数据库 schema
- 去重 + 过滤

### Phase 3：AI 处理（Day 5）
- DeepSeek API 集成
- 物种/技术标签
- 摘要生成

### Phase 4：完善+部署（Day 6-7）
- 定时任务
- 部署到 Vercel
- 域名配置
