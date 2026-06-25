# SmartStock - 智慧畜牧信息聚合站

## 项目简介

聚焦智慧畜牧（IoT/AI/自动化/机器人在养殖业的应用）的新闻聚合站，海外信源为主，按物种细分频道，严格过滤内容农场垃圾。参考 AIHOT (aihot.virxact.com) 设计。

## 目录结构约定

```
smartstock/
├── src/
│   ├── app/           # Next.js App Router 页面
│   ├── components/    # React 组件
│   └── lib/           # 工具库（collector/processor/sources/utils）
├── prisma/            # 数据库 schema
├── data/              # 信源配置 JSON
├── public/            # 静态资源
└── scripts/           # 独立脚本（采集/评估等）
```

## 命名规范

- **文件/目录名**：kebab-case（如 `news-card.tsx`、`sources.json`）
- **组件文件**：PascalCase（如 `NewsCard.tsx`）
- **函数/变量**：camelCase（如 `collectAll`、`qualityScore`）
- **常量**：UPPER_SNAKE_CASE（如 `SCORING_PROMPT`、`THRESHOLDS`）
- **数据库字段**：camelCase（如 `sourceId`、`titleZh`）
- **文件内容**：优先中文注释，代码/变量名英文

## 技术栈

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + 亮色主题（基于 AIHOT CSS 变量体系）
- Prisma + SQLite
- DeepSeek API（openai SDK + 自定义 baseURL）
- rss-parser（RSS 采集）
- node-cron（定时任务）

## 开发原则

1. **能用代码就不用 AI**：去重/权重/阈值判断全用代码，AI 只做语义评分
2. **信源比信息重要**：白名单制，T1/T1.5/T2 分级
3. **宁缺毋滥**：宁可少一个信源，也不放垃圾信源
4. **先建规范再动手**：新需求先写 SPEC.md，确认后再编码

## 环境变量

```bash
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DATABASE_URL=file:./dev.db
```

## 验证方式

- `npm run dev` 启动开发服务器
- `npm run build` 静态导出（输出到 `out/` 目录）
- `npx prisma studio` 查看数据库
- `npx tsx scripts/run-pipeline.ts` 一键采集+AI处理+导出

## 部署

- **线上地址**：https://zero-ting-glitch.github.io/smartstocknews/
- **GitHub 仓库**：https://github.com/zero-ting-glitch/smartstocknews
- **自动采集**：GitHub Actions 每 6 小时运行（采集+AI翻译评分+导出JSON）
- **自动部署**：push to master 触发 GitHub Pages 重新构建
- **Secret 名称**：`CFG_01`（DeepSeek API Key）
