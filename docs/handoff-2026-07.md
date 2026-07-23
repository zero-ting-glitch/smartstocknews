# SmartStock 开发手记 · 2026-07

> 记录关键设计决策与踩坑记录，给后续维护者（包括 AI）参考。

## 图片排版系统

### 核心原则：乐观渲染

渲染绝不被图片加载状态阻塞。先渲染，后修正。

- 未测出尺寸的图乐观假设为 `big`，立刻可见
- 真实尺寸回来后渐进修正（decor 摘除、small 重排）
- 图片加载失败只影响它自己一张，不连坐

### 图片三级分类

| 级别 | 判定条件 |
|------|----------|
| `decor` | URL 含 `avatar\|logo\|icon\|banner\|the-signal` 等关键词，或自然宽<200px、高<120px、比例极端(>5或<0.35) |
| `small` | 自然宽 <420px |
| `big` | 自然宽 ≥420px |

### 布局引擎

| 图片构成 | 布局 | 说明 |
|----------|------|------|
| 1 张大图 | `hero` | 全宽 440px 上限 |
| 2 张大图 | `duo` | 并排双列 260px |
| 1 大 + N 小 | `pin` | 品字形，大图在上 400px，小图在下横排 |
| 全是小图 | `small-row` | 横向居中，不拉伸 |
| ≥4 张含大图 | `hero` + `masonry` | 首图领衔，其余双列瀑布流 |

### Lightbox

- 自实现，无第三方依赖
- fixed overlay + backdrop-blur
- ESC / 点击背景关闭
- 打开时锁定 body 滚动

## 信源选源原则

1. **直连可用**：curl 测 HTTP 200 且返回标准 RSS XML。403/404/500/超时一律不加
2. **避开 Cloudflare 重防护**：wattagnet、agweb、producer 等 403 的不要
3. **cheerio 能抓**：列表页必须是服务端渲染直出链接。JS 渲染页面（农机360、amic.agri.cn）暂不加
4. **持续更新**：静态归档页（如农民日报农业科技频道 2019）不加
5. 改 `data/sources.json` 后，必须同步更新 `README.md`、`SPEC.md`、`CLAUDE.md` 中的信源数量

## 环境注意事项

- 沙箱可能拦截 `npm run build`（写 .next/ 目录时弹窗），拒绝即可，不影响代码
- 本地构建可通过，push 后由 GitHub Actions 跑正式构建
- dev server：`http://localhost:3000/smartstocknews/`
- 图片 CDN 域名（shortpixel、cloudfront 等）可能超时，乐观渲染确保不影响页面

## 微信公众号信源（2026-07-22 接入）

通过 [wechat-download-api](https://github.com/tmwgsicp/wechat-download-api) 本地服务中转获取微信公众号 RSS。

### 本地运行

```bash
cd docker/wechat-download-api
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# 修改 .env：SITE_URL=http://localhost:5000
python app.py  # → http://localhost:5000
```

### 配置流程

1. 浏览器打开 `http://localhost:5000/login.html` 微信扫码登录
2. 搜索并订阅公众号 → 获得 RSS URL `http://localhost:5000/api/rss/{fakeid}`
3. 将 RSS URL 填入 `data/sources.json` 对应源
4. 首次使用需手动 POST `/api/rss/poll` 拉取历史文章
5. 管线 Step 2 自动采集公众号 RSS，`skipContentScrape: true` 跳过爬取

### 当前已接入的公众号（5 个）

| 公众号 | 信源 ID | 等级 |
|--------|---------|------|
| 绿水智慧农业 | wx_lvshui | T1 |
| DJI大疆农业 | wx_dji | T1 |
| 中环易达 | wx_zhonghuanyida | T1 |
| 数字农业 Insights | wx_digits_agri | T1 |
| 智慧水产 | wx_shuichan | T1.5 |

## AI 语言检测（2026-07-22）

`analyzeItem` 加入 `hasChinese()` 检测，自动判断内容语言：
- 含中文 → 跳过全文翻译，`titleZh` 直接用原标题（公众号中文文章适用）
- 纯英文 → 保持全流程翻译
- 参考 `scripts/run-pipeline.ts` 中 `hasChinese()` 函数

## 待办

- [ ] 农机360 / 中国农业机械化信息网 — Playwright 爬取接入（需要 JS 渲染）
- [ ] 正文图片位置感知穿插（目前首图固定插第 2 段后）
- [ ] 信源健康检查自动化（定期测 RSS 可用性）
- [ ] masonry 小图视觉优化（目前全假设 big，真实 small 混入会撑满列宽）
- [ ] wechat-download-api 开机自启 / 作为 Windows 服务运行

## 重要踩坑记录

### CJK 预筛失效（2026-07-22 发现并修复）

**问题**：`matchKeyword()` 对长度 ≤5 的中文关键词使用 `\b` 正则词边界匹配，但 `\b` 对 CJK 字符无效，导致所有中文关键词（"农业"、"养殖"、"机器人"、"自动"、"精准"等）永远匹配失败。

**症状**：公众号文章（绿水智慧农业、DJI大疆农业、数字农业 Insights 等）关键词预筛通过率为 0，全部被误判为不相关。

**修复**：在 `matchKeyword()` 中加入 `hasCJK()` 检测，含中文的关键词直接用 `includes()` 匹配，纯 ASCII 短词保留 `\b` 边界匹配。

**涉及文件**：
- `scripts/run-pipeline.ts` — `matchKeyword()` 函数
- `scripts/import-wechat.ts` — `matchKeyword()` 函数
- `scripts/resume-ai.ts` — `matchKeyword()` 函数

**教训**：所有涉及正则 \b 匹配的代码都要考虑 CJK 字符的特殊性。

### 内容完整性守卫（2026-07-22 加入）

**问题**：复位脚本 `resume-ai.ts` 直接取 `aiScores=null` 的 item 喂 AI，没有检查 item 是否有正文内容（contentFull），导致 13 篇只有 RSS 摘要（~300 字）的文章进入 AI 评分+翻译，产出短翻译且无图片。

**根本原因**：管线 Step 3（全文爬取）被中断后，恢复脚本跳过了 Step 3 直接从 Step 4 开始，但 Step 4 没有前置校验。

**修复**：
- `run-pipeline.ts` Step 4 加入内容完整性守卫：`contentFull + contentHtml < 100 字` → 跳过 AI，标记 `needs_full_scrape`
- `resume-ai.ts` 加入同样的守卫
- 13 篇受影响文章中 8 篇补爬成功（含摩洛哥文章：翻译从 337→1774 字，图 10 张），5 篇（Agriland 403/jxct 产品页）已处理

**教训**：任何"恢复/续跑"脚本必须包含与主管线相同的校验逻辑。AI 处理入口必须有"输入内容完整性"的硬性检查。

### 产品页误采（2026-07-22 修复）

**问题**：精讯畅通（jxct）的 `listingSelector: "a[href*='news'], a[href*='solution'], a[href*='product']"` 匹配了产品分类页 URL（`/product/`），导致产品分类页（"土壤类传感器＞"、"水质全光谱检测仪＞"）被当新闻采集入库。

**修复**：
- `data/sources.json` — jxct 的 listingSelector 去掉 `a[href*='product']`
- DB 中已入库的 2 条产品页标记 `isRelevant=false`
- 1 条展会新闻重置为待补爬状态

**教训**：listingSelector 必须严格匹配新闻/文章页面模式，产品、分类、标签页等不应纳入。

## 管线完整性检查清单

管线运行前/恢复前应确认：

- [ ] Step 3（全文爬取）是否完成？`scrapedAt` 不为空的 item 数
- [ ] Step 4（AI 处理）是否有足量内容？`contentFull` 或 `contentHtml` 长度 > 100
- [ ] 预筛关键词对中文源是否有有效匹配？（CJK 边界测试）
- [ ] 信源 listingSelector 是否只匹配文章页面？（排除 product/category/tag）

## 新脚本说明

### `scripts/import-wechat.ts`
从 WeChat Download API 批量拉取公众号历史文章（5 月至今），经关键词预筛后入库。用法：`npx tsx scripts/import-wechat.ts`

### `scripts/resume-ai.ts`
恢复中断的 AI 处理管线：关键词预筛 → Stage 1 语义筛选 → Stage 2 评分+翻译+摘要。用法：`npx tsx scripts/resume-ai.ts`

### `scripts/fix-articles.ts`
补爬 + 重跑 AI：针对已 AI 处理但缺正文的文章，重新全文爬取并重新 AI 评分翻译。用法：`npx tsx scripts/fix-articles.ts`

## 详情页标签样式统一（2026-07-23）

详情页标题区域的来源/等级/物种等标签进行了视觉统一，详见 [detail-meta-style.md](detail-meta-style.md)。

**核心改动**：
- 信源类型标签从紫色改为主题色（`var(--m-brand)`）
- 所有标签统一 padding/font-size/font-weight，消除高度不一问题
- 物种标注从 `detail-info` 区域上移到标签行，改为卡片样式
- Timeline 圆点从金黄色改为橘色

**涉及文件**：
- `src/app/globals.css` — CSS 变量和类定义
- `src/app/detail/page.tsx` — HTML 结构调整（标签顺序、物种位置）
- `docs/detail-meta-style.md` — 新增，详细记录了所有改动
