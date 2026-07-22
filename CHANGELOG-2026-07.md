# SmartStock 工作日志（2026-07-20 ~ 2026-07-22）

> 整理：虫虫 🐛 ｜ 范围：详情页图片系统重构 / 信源扩充 / 精选逻辑优化 / 跨源去重修复 / 公众号接入 / AI 语言检测 / 管线恢复 / CJK 修复

---

## 一、总览

| 日期 | 主题 | 状态 |
|---|---|---|
| 2026-07-20 | 详情页图片排版重构（推翻 DeepSeek 阻塞式方案） | ✅ 完成 |
| 2026-07-20 | 信源扩充 26 → 32 | ✅ 完成 |
| 2026-07-20 | 文档同步（README / SPEC / HANDOFF） | ✅ 完成 |
| 2026-07-21 | 精选逻辑优化（精选率 61% → 22%） | ✅ 完成 |
| 2026-07-21 | 跨源去重修复（multiSourceCount 不再恒为 1） | ✅ 完成 |
| 2026-07-22 | 微信公众号信源接入 32 → 37（+5 个公众号） | ✅ 完成 |
| 2026-07-22 | AI 语言检测：中文跳过全文翻译，省 token | ✅ 完成 |
| 2026-07-22 | 公众号历史文章批量导入（+144 篇） | ✅ 完成 |
| 2026-07-22 | 中断管线恢复 + CJK 预筛修复 + 内容守卫 | ✅ 完成 |

---

## 二、详情页图片排版重构（2026-07-20）

### 背景

DeepSeek 此前改的版本存在严重问题：
- 写死 `.slice(0, 3)`，库里 43/74 篇文章图数在 6-8 张，大量图片被丢弃
- 不看真实尺寸，头像图（272×272）被当正文图拉伸变形
- 品字形硬编码 `nth-child`，不管图片实际比例
- 图片全堆正文后，8500+ 字长文阅读体验差

### 核心设计：乐观渲染（Optimistic Rendering）

**渲染绝不被图片加载状态阻塞。**
- ❌ 旧错误：等所有图 `onLoad` 测出尺寸才决定布局。外站图一挂全判成裂图 → 整页无图
- ✅ 现行：**先渲染，后修正**。未测尺寸的图按序号乐观假设为 `big`（首图永远 hero），立刻可见；真实尺寸回来后渐进修正（decor 摘除、small 重排）；裂图只藏自己，不连坐

### 图片三级分类

| 级别 | 判定 | 处理 |
|---|---|---|
| `decor` | URL 含 `avatar|logo|icon|banner|the-signal|...` 或尺寸 <200px / 比例极端 | 过滤 |
| `small` | 宽 <420px | small-row / 品字小图位 |
| `big` | 宽 ≥420px | hero / duo / masonry 主图 |

### 布局引擎 `decideLayout()`

| 图数/构成 | 布局 |
|---|---|
| 1 张大图 | `hero` 全宽限高 440px |
| 2 张大图 | `duo` 并排双列 |
| 2 大 + 1 小 | `duo-plus`（2 大并排 + 小图在下居中） |
| 1 大 + N 小 | `pin` 品字形 |
| 全是小图 | `small-row` 横向居中不拉伸 |
| ≥4 张含大图 | `hero` 领衔 + 其余 `masonry` 双列瀑布流 |

### 其他要点

- **首图穿插正文**：中文翻译模式且段落 ≥3 时，hero 图插到第 2 段后（Medium/公众号风格）
- **masonry 单数末尾居中**：grid 双列实现，奇数时最后一张独占整行居中限宽 62%
- **lightbox**：自实现无依赖，ESC/点击背景关闭，锁 body 滚动
- **微调**：详情页容器 720→760px、翻译正文 15→16px、精选理由/AI 摘要圆角统一 12px

### 改动文件

- `src/app/detail/page.tsx`（图片分类 + 布局引擎 + lightbox）
- `src/app/globals.css`（gallery 布局样式 + lightbox + 详情页微调）

---

## 三、信源扩充（2026-07-20）

### 新增 6 个英文 RSS 源（26 → 32）

| 信源 | 方向 | 等级 |
|---|---|---|
| AGRIVI | 农业管理软件/数字农业 | T1.5 |
| AgriTech New Zealand | 新西兰农业科技创新 | T1.5 |
| Agriland | 爱尔兰畜牧+农机 | T1.5 |
| Farm Progress | 美国大田/精准农业 | T1.5 |
| Vertical Farm Daily | 垂直农场/室内种植 | T1.5 |
| HortiDaily | 园艺日报/温室设施 | T1.5 |

均为**标准 RSS 2.0、直连 200、无需 Playwright**。

---

## 四、精选逻辑优化（2026-07-21）

### 背景

旧逻辑只看绝对阈值，导致严重失衡：总精选率 61%（77 篇里 47 篇），T1 精选率 95%（阈值 60 过松），T1.5 精选率 0%（阈值 70 过严）。

### 新机制：阈值 + tier 内百分位双条件

| tier | 阈值 | tier 内百分位 |
|---|---|---|
| T1 | >= 75 | 前 40% |
| T1.5 | >= 65 | 前 30% |
| T2 | >= 80 | 前 15% |

**双条件同时满足**才是精选。百分位在导出阶段重算（export-static.ts 的 recomputeFeatured()），历史文章自动纠偏。

### 热点逻辑调整

```
isHot = qualityScore >= 82  OR  multiSourceCount >= 2
```

- 单源热点门槛 75→82；多源门槛 >=3 降为 >=2

### 效果

| 指标 | 改前 | 改后 |
|---|---|---|
| 总精选率 | 61% | **22%** |
| T1 精选率 | 95% | 40% |
| T1.5 精选率 | 0% | 11% |

---

## 五、跨源去重修复（2026-07-21）

旧 bug：`isDuplicate()` 发现相似标题直接跳过，没有任何地方给 `multiSourceCount` 赋值 >1。

修复：`seenTitles` 改为 `{ norm, id }[]`，命中重复时 `increment multiSourceCount`。预加载近 30 天历史文章。Jaccard 阈值 0.6。

---

## 六、微信公众号信源接入（2026-07-22）

### 接入 5 个公众号

通过 wechat-download-api 本地服务中转 RSS，`skipContentScrape: true` 跳过爬取。

| 公众号 | 方向 | tier |
|--------|------|------|
| 绿水智慧农业 | 农业传感器/物联网 | T1 |
| DJI大疆农业 | 农业无人机 | T1 |
| 中环易达 | 设施园艺 | T1 |
| 数字农业 Insights | 农业科技投资 | T1 |
| 智慧水产 | 智慧渔业 | T1.5 |

### AI 语言检测

`analyzeItem` 增加 `hasChinese()` 检测：含中文的跳过全文翻译，`titleZh` 直接用原标题，节省大量 token。

---

## 七、公众号历史文章批量导入 + 管线修复（2026-07-22）

### 背景

公众号文章仅 40 篇（RSS 只给最近 ~12 条），且管线中断导致 446 条未 AI 评分。

### 公众号导入（+144 篇，累计 184 篇）

新脚本 `scripts/import-wechat.ts`：从 WeChat API 分页拉取 5 月至今文章，经关键词预筛后入库。

| 公众号 | 之前 | 之后 |
|--------|:---:|:---:|
| 数字农业 Insights | 9 | 37 |
| 智慧水产 | 7 | 122 |
| DJI大疆农业 | 12 | 13 |
| 绿水智慧农业 | 10 | 10 |
| 中环易达 | 2 | 2 |

### 中断管线恢复（590 条处理）

信息漏斗分级：关键词预筛淘汰 374 条，AI 语义筛选淘汰 14 条，评分+翻译通过 202 条。最终导出 297 篇全部有评分。

### 内容完整性守卫

根本修复：AI 处理入口加检查（contentFull+contentHtml < 100 字→标记 needs_full_scrape，跳过 AI）。已同步到 run-pipeline.ts 和 resume-ai.ts。

### 精讯畅通（jxct）源修正

listingSelector 去掉 `a[href*='product']`，2 条产品页已清理，1 条展会新闻重置待补爬。

### 关键 BUG 修复

1. **CJK 预筛失效**：`\b` 词边界对中文字符无效。修复：matchKeyword 加 hasCJK() 检测，中文词用 includes()
2. **WeChat API 分页参数错误**：实际用 `begin` 而非 `offset`
3. **export-static.ts take:200 限制解除**：现已全量导出所有相关文章

### 改动文件

- `scripts/import-wechat.ts`（新建）
- `scripts/resume-ai.ts`（新建）
- `scripts/fix-articles.ts`（新建）
- `scripts/run-pipeline.ts`（CJK 修复 + 内容守卫）
- `scripts/export-static.ts`（去掉 take:200 + 类型修复）
- `data/sources.json`（jxct listingSelector 修正）
- `CLAUDE.md` / `README.md` / `docs/handoff-2026-07.md`（文档同步）

---

## 八、TODO（下次的活）

- [ ] 农机360 / 中国农业机械化信息网的 Playwright 爬取接入（需 JS 渲染）
- [ ] 正文图片位置感知穿插（结合原文 `<img>` 在 HTML 中的位置）
- [ ] 信源健康检查自动化（定期 curl 测 RSS 可用性）
- [ ] masonry 中小图视觉优化（真实 small 图混进 masonry 会撑满列宽）
- [ ] （进阶）embedding 相似度替代 Jaccard
- [ ] wechat-download-api 开机自启 / 作为 Windows 服务运行

---

_以上。代码干净，文档齐全，随时可以交班或继续加功能。—— 虫虫 🐛_
