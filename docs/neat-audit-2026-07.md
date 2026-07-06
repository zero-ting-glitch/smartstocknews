# SmartStock 洁癖审查与整改记录

> 日期：2026-07-03
> 审查者：Claude（neat-freak skill）

## 背景

对 SmartStock 项目进行全量知识审查，从第一性原理、最终目的、用户第一三个角度出发，识别系统设计与实现中的问题。

---

## 已修复项

### A1. Source 模型 `species` / `category` 同义字段

**问题**：Source 表同时有 `species` 和 `category`，注释均为 `"livestock" | "crop" | "aggtech"`，存储值完全一致。

**处理**：删除 `Source.species` 字段，统一使用 `category`。管线代码中的 `source.type` 引用改为 `source.defaultCategory`。sources.json 的 `type` 字段保留但不再映射到 DB。

### A2. Feedback 模型死代码

**问题**：Prisma 中有完整的 `Feedback` 模型和关联，但前端为静态导出，没有任何反馈提交入口或 API 路由，该表永远不会产生数据。

**处理**：从 `schema.prisma` 中移除 `Feedback` 模型及其关联。

### B1. isHot 阈值文档与代码不一致

**问题**：SPEC.md 写 `>= 75`，实际代码为 `>= 60`，相差 15 分。

**处理**：代码改为 `>= 75`，与 SPEC 对齐。同时增加 `multiSourceCount >= 3` 条件（SPEC 原文要求）。

### B2. isFeatured 阈值扁平化

**问题**：SPEC.md 写三档（T1 >= 60 / T1.5 >= 70 / T2 >= 80），实际代码写死 `>= 55`，意味着大部分 AI 通过的文章自动获"精选"标签，丧失筛选意义。

**处理**：代码改为分档阈值。

### B3. 质量分公式文档不一致

**问题**：SPEC.md 写乘法公式 `avg × 权重 × 多源系数`，代码和 CLAUDE.md 为加法 `avg × 权重 + 多源加分`。

**处理**：SPEC.md 修正为加法公式，与代码和 CLAUDE.md 对齐。

### C1. speciesColors / speciesNames 缺 general

**问题**：`general` 是有效 subcategory，但 `utils.ts` 的配色和中文名映射中均未定义，前端渲染会缺少颜色或显示空白。

**处理**：补全 `general` 配色（灰色）和中文名。

### C2. HTML 净化不完整

**问题**：`sanitizeHtml` 仅过滤 `<script>/<style>/事件属性/javascript:`，但未处理 `<iframe>`、`<embed>`、`<object>`、`<svg onload>`、`data:` URI 等 XSS 向量。

**处理**：增强净化规则覆盖更多攻击面。

### D1. RSS User-Agent 自报家门

**问题**：RSS 请求使用 `User-Agent: SmartStock/1.0 (RSS Reader)`，直接表明爬虫身份，导致大量 403 回退。

**处理**：改为标准 Chrome UA。

### D2. 并发爬虫域名限速竞态

**问题**：`scrapeWithDomainDelay` 在 `Promise.allSettled` 中并发调用，同一域名的多个请求同时读取 `domainLastRequest`，同时通过限速检查，同时发出请求，限速失效。

**处理**：增加并发锁保护域名限速表。

### D3. coreKeywords 过度泛化

**问题**：部分信源的 `coreKeywords` 包含 `technology`、`data`、`digital`、`platform`、`monitoring` 等过于通用的词汇，几乎匹配该信源 80% 以上文章，使过滤形同虚设。

**处理**：从所有信源 `coreKeywords` 中移除过度泛化的通用词。

### E1/E2. SPEC.md 文档同步

**问题**：SPEC.md 中质量分公式、isHot/isFeatured 阈值与实际代码不符。

**处理**：同步更新 SPEC.md。

---

## 讨论待定项

以下问题在审查中发现，但本次不予修复，留档供后续决策。

### TBD-1: DB 架构——暂存区而非持久层

**现状**：`dev.db` 在 `.gitignore` 中，GitHub Actions 每次从头创建空数据库。管线依赖 Step 5 增量合并从 `public/data/items.json` 恢复旧数据。DB 实际充当暂存区，JSON 是持久层。

**负面影响**：
- 管线步骤顺序隐式依赖，调序可能引发死循环（已出过一次事故）
- 算法迭代后无法批量重评旧文章
- 增量合并在导出中额外实现了一套"数据库工作"，复杂度高

**建议**：考虑将 DB 设为持久层（`.gitignore` 排除但通过 artifact 缓存保留），或彻底移除 DB 依赖改用 JSON 全流程。涉及较大架构变动，待业务稳定后评估。

### TBD-2: 站内搜索

**现状**：无站内搜索功能，用户无法检索文章。

**建议**：静态站可用客户端全量搜索（加载 items.json 在前端做全文检索），或接入第三方搜索服务。属于新功能，非修复。

### TBD-3: `general` 频道定位

**现状**：AI 分类 prompt 要求"不要轻易选 general"，但 `general` 作为一级导航频道与猪/禽/牛/羊平级。进入 `general` 频道的用户实际看到的是 AI 分类器最不确定的兜底文章。

**建议**：如果 AI 分类足够准，general 应该没多少文章，不需独立频道；如果不准，应该优化分类 prompt 而非给用户看兜底桶。设计决策，需确认产品意图。

### TBD-4: Stage 1 AI 筛选的经济效益待验证

**现状**：管线经过信源级 coreKeywords 和预筛双维关键词两层免费过滤后，才进入 Stage 1 AI 语义筛选（付费 API）。

**问题**：Stage 1 通过率未知。如果拒绝率不足 20%，该层节省的 Stage 2 token 成本无法覆盖自身调用成本，反而增加延迟和失败面。

**建议**：增加 Stage 1 拒绝率指标打点，累积数据后评估是否保留或调整阈值。

### TBD-5: 爬虫失败缺乏通知机制

**现状**：某信源改版导致爬虫持续失败时，管线只打日志不冒泡，用户不会收到通知。如果所有信源都失败，前端显示的就是陈旧内容。

**建议**：增加失败率告警阈值（如同域名失败率 > 50% 时发出信号），需配合通知通道（Slack/邮件/Telegram）。本次不修。

### TBD-6: 自动更新定时触发

**现状**：`collect.yml` 中定时触发被注释，仅支持手动触发。

**建议**：等业务稳定可恢复 `cron: '0 2,8,14,20 * * *'` 定时触发。

---

## 信源变更记录

### coreKeywords 精简（通用词移除）

以下词汇从所有信源的 `coreKeywords` 中移除：
`technology`, `data`, `digital`, `platform`, `monitoring`

这些词汇过于通用，在技术媒体中几乎每篇文章都会出现，使其失去过滤价值。
