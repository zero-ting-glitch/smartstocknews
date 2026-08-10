<!--
  ⚠️ CLEANUP_MARKER: scroll-flash (2026-07-23)
  当此问题被彻底解决后，删除本文件并在 git 中提交。
  搜索 "CLEANUP_MARKER: scroll-flash" 可定位所有相关文档。
-->

# 详情页返回闪跳问题 — 实验记录

> **问题描述**：从详情页点击"← 返回"回到列表页时，用户先看到顶部画面，
> 再"跳"到之前阅读位置，形成闪一下的感觉。
> 
> 原有滚动恢复功能（commit `f59d59a`）有效但存在闪跳，
> 改进方案（commit `7f47b4e`）未彻底解决，最终全部回滚。

## 已尝试方案

### 方案 A：useEffect + requestAnimationFrame + items 依赖
- **实现**：NewsCard 点击时保存 `scrollY` 到 `sessionStorage`，Timeline 组件的 `useEffect` 监听 `items` 变化，就绪后用 `rAF` 执行 `window.scrollTo`
- **预期**：数据加载后恢复滚动，rAF 确保 DOM 高度正确
- **结果**：✅ 滚动能恢复 ❌ 有明显闪跳（数据加载→渲染顶部→下一帧才滚）

### 方案 B：useLayoutEffect + ref 守卫 + 无依赖数组
- **实现**：`useLayoutEffect` 无依赖数组（每次渲染都跑），`ref` 确保只滚一次；无 `items.length === 0` 守卫，即使数据未加载也立即滚
- **相比被 revert 的原 fix（7f47b4e）的区别**：原 fix 有 `items.length === 0` 守卫导致第一阶段不滚，数据加载后再滚时已来不及；本方案去掉了该守卫
- **预期**：useLayoutEffect 在浏览器绘制前执行 → 用户感知不到从顶部跳转
- **结果**：❌ 仍存在闪跳（疑似 SSR 静态 HTML 在 hydrate 前已被绘制在位置 0）

### 方案 C：同步阻塞 `<script>` 在 layout.tsx 的 `<head>` 中
- **实现**：在 `<head>` 末尾添加自执行 IIFE，同步读取 `sessionStorage`、设 `scrollRestoration='manual'`、执行 `scrollTo`，在 body 解析前滚到位
- **预期**：浏览器画任何东西之前就已滚好，彻底无闪
- **结果**：❌ 滚动恢复完全失效（回到主页顶部），疑似 dev 模式下浏览器缓存了不含此 script 的旧 HTML，或 Next.js RSC 渲染链路改变了 script 的执行时机

### 方案 D：useState 惰性初始化器
- **实现**：用 `useState(() => { scrollTo(pos); return true; })` 在组件 render 阶段（比 useLayoutEffect 更早）同步滚到位
- **预期**：render 阶段执行，在 commit 和 paint 之前，比用 layout effect 更早拦截
- **结果**：❌ 与方案 C 同样完全失效，且 build 时遇到 `sessionStorage is not defined` 的 SSR 报错（需加 `typeof window` 守卫）

### 方案 E：NewsCard 的 `<a>` 改为 `<Link>` + Router 事件
- 未尝试，推测无法解决根本问题

## 核心难点

```
浏览器流程：
  ① 服务端渲染(SSR) → 生成静态 HTML（含 layout shell）
  ② 浏览器绘制静态 HTML（此时 scrollY = 0） ← 闪跳就发生在这里
  ③ 加载 JS → React hydrate
  ④ React 组件挂载 → useLayoutEffect / useEffect 执行
  ⑤ scrollTo() → 滚动到正确位置

①→② 之间的时间窗口，任何 React 层机制都来不及干预。
```

### 已被排除的因素
- `history.scrollRestoration = 'manual'` → 能阻止浏览器自动恢复，但挡不住第②步的初始绘制
- `useLayoutEffect` vs `useEffect` → 两者都在第③步之后执行，无法影响第②步
- 组件渲染时机 → 不等 items 就绪就滚是对的，但依然在第②步之后

## 可能的突破方向（供后续参考）

1. **内联 script + 强制禁用浏览器回退缓存**
   - 在 `<head>` 中用 `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` 避免浏览器缓存旧 HTML
   - 但这会影响整体缓存策略，可能得不偿失

2. **CSS 遮罩 + 首帧隐藏**
   - 默认 `body { visibility: hidden }`，在内联 script 恢复滚动后再显示
   - 副作用：首屏白屏时间增加

3. **不用 `history.back()`，改用 `<a>` 直接导航**
   - 详情页的"← 返回"从 `history.back()` 改为 `<a href={BASE_PATH}>`
   - 新加载的页面可以确保内联 script 是最新版本
   - 但会丢失回退动画和浏览器的原生回退行为

4. **`pageshow` 事件 + 内联 script 组合**
   - `pageshow` 对 bfcache 恢复有效，内联 script 对首次加载有效
   - 上次尝试时内联 script 未生效，可能需配合缓存头强制刷新

## 当前状态

- 滚动恢复功能：**已全部回滚**（`git checkout HEAD -- NewsCard.tsx Timeline.tsx`）
- 保留在代码中的：详情页图片去重 + hero 图消失修复（[page.tsx](src/app/detail/page.tsx)）
- 待解决：返回闪跳问题仍存在，后续从上述方向中选择切入

---

## 方案 F（2026-07-27，虫虫实施）：CSS 遮罩 + 渲染后恢复

### 根因修正

前四个方案失败的真正原因**不是执行时机，而是页面高度**：
列表数据是 client-side fetch（`useEffect` 里 `fetch items.json`），静态 HTML 里**没有文章**，
返回时页面只有标题那么高。任何"提前 scrollTo"都会被浏览器 **clamp 到 0**——
因为那一刻页面根本没有 2000px 高。等数据渲染出文章，用户早已看到顶部。

结论：所有"提前滚动"方案（A~D）原理上必死。唯一正解是方向 2：**先藏住页面**。

### 实现（3 处改动）

1. **`src/app/layout.tsx`**：head 末尾内联同步脚本（body 解析前执行，已验证位置）
   - 检查 `sessionStorage.listRestorePath === location.pathname`，命中则：
   - `history.scrollRestoration = 'manual'`（阻止浏览器在低高度页面上做无效恢复）
   - `document.documentElement.classList.add('restore-scroll')`（CSS 隐藏页面）
   - 3 秒超时兜底移除（防 JS 加载失败导致永久白屏）
2. **`src/app/globals.css`**：`html.restore-scroll body { opacity: 0 }`
   - 用 `opacity:0` 而非 `display:none`：保留布局，不影响后续 scrollTo 的高度计算
3. **`src/components/Timeline.tsx`**：
   - `pagehide` 时保存 `scrollY` + 当前路径到 sessionStorage（所有列表页共用此组件）
   - `items` 从 0 变为 >0（数据渲染完成）后，双 rAF → `scrollTo` → 移除遮罩 class → 清标记

### 关键设计点

- **路径匹配**：标记存路径，只有"回到的页面 == 离开时的页面"才遮罩+恢复；
  不匹配（如从主页点进 /pig 频道）静默忽略，避免误遮罩
- **bfcache 命中时零开销**：浏览器完整恢复页面与滚动位置，内联脚本不执行、
  React 不重挂载，原生体验，无闪跳
- **bfcache 不命中时**：走遮罩流程，用户看到的是"短暂白屏 → 直接出现在原位置"，
  白屏是加载的正常感知，闪跳是 bug 的感知
- **超时兜底**：3 秒内无论恢复成功与否都强制显示页面

### 验证状态

- [x] 内联脚本确认位于 `<body>` 之前（curl 验证 HTML 源码）
- [x] 遮罩 CSS 已注入
- [ ] **待用户浏览器实测**：列表页滚到中部 → 点卡片进详情 → 点 ← 返回，观察是否无闪跳
- [ ] 验证通过后：删除本文档并 git 提交（按 CLEANUP_MARKER 约定）

### 实测结果（2026-07-27，Edge）：❌ 失败，已回滚

用户实测仍闪跳，且闪跳时能看到"暂无新闻"（SSR 空数据内容）。
失败原因：**React hydrate 会把内联脚本加在 `<html>` 上的 class 当作不匹配属性处理**，
遮罩在 hydrate 阶段即被移除，用户先看到 SSR 的"暂无新闻"，数据加载后再跳——闪跳依旧。
教训：**任何依赖"在 React 管理的元素（html/body）上动手脚"的方案，在 Next.js App Router 下都不可靠。**
应用户要求全部回滚（`git checkout HEAD -- Timeline.tsx layout.tsx globals.css`），不叠加补丁。

---

## 方案 G（2026-07-28，虫虫实施）：SSG 数据注入 —— 治本

### 思路转变

遮罩/抢跑都是在客户端打补丁，全部不可靠。回到第一性原理：
**闪跳是因为 SSR HTML 里没有文章（高度不够、内容是"暂无新闻"）**。
那就让 SSR HTML 直接包含完整文章列表——浏览器原生滚动恢复一次到位，
和普通 MPA 网站一样，**不需要任何客户端补丁**。

### 实现（新建 2 个文件 + 改 5 个页面 + 修 3 个页面）

1. **`src/lib/static-data.ts`**（新建）：Server Component 专用，构建时读 `public/data/*.json`，
   裁剪 `translationZh` 等大字段（Timeline 用不到，留着 RSC payload 体积翻倍）
2. **`src/components/ListPageClient.tsx`**（新建）：通用列表页 client 组件，
   `useState(初始数据)` + 挂载后后台 fetch 无感刷新（dev 模式数据变更时有用）
3. **`src/app/page.tsx`**：改为 Server Component，注入 featured 文章（46 篇，36KB）
4. **`src/app/all/page.tsx`**：改为 Server Component，注入全量（297 篇，210KB）
5. **`src/components/SpeciesPage.tsx`**：改为 Server Component，注入频道数据；
   7 个频道 page.tsx 无需改动
6. **坑**：`field/fruit/horticulture/page.tsx` 有多余的 `'use client'` 标记，
   会把 SpeciesPage（server）拽进 client bundle 导致 `fs` resolve 失败——已删除

### 效果（curl 实测 SSR HTML）

| 页面 | HTML 体积 | SSR 卡片数 |
|---|---|---|
| 首页 | 96.8KB | 46 |
| /all | 460KB | 297 |
| /pig | 35KB | 10 |
| /horticulture | 39KB | 12 |
| 其余频道 | 20-90KB | 全部正常 |

SSR HTML 自带完整列表与高度 → 浏览器原生滚动恢复到位，**零 JS 补丁、零遮罩**。
附带收益：SEO 友好（内容可被爬虫索引）、首屏 FCP 更快（无需等 client fetch）。

### 注意点

- **数据时效**：依赖"构建时 items.json 是最新的"。当前工作流（采集管线 → 导出 → 自动构建部署）
  天然满足，闭环成立
- **体积**：/all 页 460KB（gzip 后约 60-80KB）可接受；若未来文章超千篇，
  需考虑 /all 分页或进一步裁剪字段（如不传 featuredReason）
- **dev server 注意**：改动 Server/Client 边界后必须重启 dev server，
  否则 Turbopack 旧模块图会把 server-only 文件误打包（报 `Can't resolve 'fs'`）

### 验证状态

- [x] 9 个列表页 SSR HTML 全部含完整卡片、零报错
- [ ] **待用户浏览器实测**：列表页滚到中部 → 点卡片进详情 → 点 ← 返回
- [ ] 验证通过后：删除本文档并 git 提交（按 CLEANUP_MARKER 约定）

---

<!-- CLEANUP_MARKER: scroll-flash -->
