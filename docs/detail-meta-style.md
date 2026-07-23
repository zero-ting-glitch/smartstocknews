# 详情页标签样式统一 · 2026-07-23

> 详情页标题区域的信源来源、信源类型、等级、质量分、精选、物种标签等一排卡片进行了样式统一和结构调整。

## 改动

### 1. 标签顺序调整

```
改前：[来源名] [T1/T1.5/T2] [📡 信源类型(紫色)] [质量分] [精选]
改后：[来源名] [📡 信源类型(主题色)] [T1/T1.5/T2] [质量分] [精选] [物种卡片...]
```

信源类型（RSS/公众号等）移到 T1/T1.5 之前，凸显信息层级。

### 2. 配色调整

- **信源类型卡片**：从紫色 `rgba(99,102,241,0.08) + #6366f1` 改为主题色 `var(--m-brand-weak) + var(--m-brand)`
- **主页列表页**（同一问题）：`.tag-source-type` 从紫色改为 `var(--m-ink-muted) + var(--m-bg-muted)`，与来源名称 `.m-row-src` 保持一致

### 3. 高度与字重统一

所有 `detail-meta` 子卡片统一参数：

| 属性 | 改前 | 改后 |
|------|------|------|
| padding | 2px/3px 混用 | **2px 10px** |
| font-size | 11px/12px 混用 | **12px** |
| font-weight | 500/600/700 混用 | **600** |
| border-radius | 统一 6px | 不变 |

### 4. 物种标签上移

- 物种标注（大田/果蔬/园艺）从 `detail-info` 区域移到 `detail-meta` 标签行末尾
- 样式从纯文字改为卡片（带背景色+padding+border-radius）
- 背景色使用 `speciesColors[s] + 18` 透明度，文字色用 `speciesColors[s]`

### 5. Timeline 圆点颜色

- `--tl-accent` 从 `rgba(251,191,36,0.82)`（金黄）改为 `rgba(249,115,22,0.82)`（橘色）

## 相关文件

- [src/app/globals.css](src/app/globals.css) — 所有 CSS 变量和类定义
- [src/app/detail/page.tsx](src/app/detail/page.tsx) — 标签顺序和物种位置
- [src/components/NewsCard.tsx](src/components/NewsCard.tsx) — 使用 `.tag-source-type`（仅引用，未改）
