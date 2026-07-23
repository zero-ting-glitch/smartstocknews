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

<!-- CLEANUP_MARKER: scroll-flash -->
