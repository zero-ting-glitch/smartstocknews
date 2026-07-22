/**
 * 从 SQLite 数据库导出静态 JSON 文件到 public/data/
 * 用于 Cloudflare Pages 部署（前端静态托管）
 *
 * 用法: npx tsx scripts/export-static.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TIER_PERCENTILE } from '../src/lib/processor/calculator';

const prisma = new PrismaClient();
const OUTPUT_DIR = join(process.cwd(), 'public', 'data');

/**
 * 精选阈值（与 calculator.ts 保持一致）
 * 2026-07-21：T1=75 / T1.5=65 / T2=80
 */
const FEATURED_THRESHOLDS: Record<string, number> = {
  'T1': 75,
  'T1.5': 65,
  'T2': 80,
};

/**
 * 按 tier 分组，用"阈值 + tier 内百分位"重算 isFeatured
 * 目的：控制整体精选率在 20-30%，避免 T1 精选泛滥（旧阈值 60 时 T1 精选率 95%）
 *
 * 规则：qualityScore >= 阈值 **且** 在同 tier 内按 qualityScore 排名前 N%
 */
function recomputeFeatured<T extends { qualityScore: number; source: { tier: string }; isFeatured?: boolean }>(
  items: T[]
): T[] {
  // 按 tier 分组
  const byTier = new Map<string, T[]>();
  for (const item of items) {
    const tier = item.source.tier;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(item);
  }

  // 每个 tier 内按质量分降序排序，取前 N% 且过阈值
  const featuredIds = new Set<string>();
  for (const [tier, group] of byTier) {
    const threshold = FEATURED_THRESHOLDS[tier] ?? 80;
    const percentile = TIER_PERCENTILE[tier] ?? 0.15;
    const sorted = [...group].sort((a, b) => b.qualityScore - a.qualityScore);
    // 百分位名额：至少 1 篇，向下取整
    const quota = Math.max(1, Math.floor(sorted.length * percentile));
    let picked = 0;
    for (const item of sorted) {
      if (picked >= quota) break;
      if (item.qualityScore < threshold) break; // 后面的更低，提前结束
      featuredIds.add((item as any).id);
      picked++;
    }
  }

  // 覆盖 isFeatured 字段
  return items.map(item => ({
    ...item,
    isFeatured: featuredIds.has((item as any).id),
  }));
}

interface ExportItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  summaryZh: string | null;
  translationZh: string | null;
  featuredReason: string | null;
  publishedAt: string;
  source: {
    name: string;
    nameZh: string;
    tier: string;
    sourceType: string;
  };
  species: string;
  category: string | null;
  subcategory: string | null;
  techTags: string;
  qualityScore: number;
  isHot: boolean;
  multiSourceCount: number;
  isFeatured?: boolean;
}

interface ExportHotItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  multiSourceCount: number;
  publishedAt: string;
  qualityScore: number;
}

interface ExportStats {
  sources: number;
  items: number;
  featured: number;
  hot: number;
  lastUpdated: string;
}

// 读取已导出的 items.json（增量合并用）
function readExistingItems(): ExportItem[] {
  const filePath = join(OUTPUT_DIR, 'items.json');
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

/** contentHtml 导出前净化：移除危险标签/属性/协议，防止存储型 XSS */
const sanitizeHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<svg[\s\S]*?on\w+\s*=[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*\S+/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data:\s*text\/html/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '');

// 合并：新数据按 ID 覆盖旧数据，**旧数据中未出现在新数据集中的 ID 不再保留**
// DB 是权威来源（WHERE isRelevant=true），已标记为不相关的文章不应出现在导出中
function mergeItems(existing: ExportItem[], fresh: ExportItem[]): ExportItem[] {
  const freshIds = new Set(fresh.map(i => i.id));
  const map = new Map<string, ExportItem>();
  // 只保留旧数据中仍在 DB 里标记为相关的文章
  for (const item of existing) if (freshIds.has(item.id)) map.set(item.id, item);
  for (const item of fresh) map.set(item.id, item);
  return Array.from(map.values()).sort((a, b) =>
    (b.publishedAt || '').localeCompare(a.publishedAt || '')
  );
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. 导出所有相关条目
  const items = await prisma.item.findMany({
    where: { isRelevant: true },
    include: { source: { select: { name: true, nameZh: true, tier: true, sourceType: true } } },
    orderBy: { publishedAt: 'desc' },
  });

  const freshItems: ExportItem[] = items.map(item => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh,
    url: item.url,
    summaryZh: item.summaryZh,
    translationZh: item.translationZh,
    featuredReason: item.featuredReason,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : '',
    source: item.source,
    species: item.species,
    category: item.category,
    subcategory: item.subcategory,
    techTags: item.techTags,
    qualityScore: item.qualityScore,
    isHot: item.isHot,
    multiSourceCount: item.multiSourceCount,
  }));

  // 增量合并：保留旧数据中未被本次管线处理的条目
  const existingItems = readExistingItems();
  const mergedItems = mergeItems(existingItems, freshItems);
  // 按 tier 分组重算 isFeatured（阈值 + 百分位），控制精选率 20-30%
  const exportItems = recomputeFeatured(mergedItems);
  const preserved = exportItems.length - freshItems.length;
  const featuredCount = exportItems.filter(i => i.isFeatured).length;
  writeFileSync(join(OUTPUT_DIR, 'items.json'), JSON.stringify(exportItems, null, 2));
  console.log(`Exported ${exportItems.length} items (${freshItems.length} new + ${preserved} preserved), featured: ${featuredCount} (${Math.round(featuredCount*100/exportItems.length)}%)`);

  // 1.5 导出详情 JSON（每条一个文件，含全文）
  const detailDir = join(OUTPUT_DIR, 'items');
  mkdirSync(detailDir, { recursive: true });
  for (const item of items) {
    const detail = {
      ...exportItems.find(e => e.id === item.id),
      contentFull: item.contentFull || '',
      translationZh: item.translationZh || '',
      images: item.images ? (() => { try { return JSON.parse(item.images); } catch { return []; } })() : [],
      author: item.author || '',
      featuredReason: item.featuredReason || '',
      contentHtml: item.contentHtml ? sanitizeHtml(item.contentHtml) : '',
      scrapeMethod: item.scrapeMethod || 'rss',
    };
    writeFileSync(join(detailDir, `${item.id}.json`), JSON.stringify(detail, null, 2));
  }
  console.log(`Exported ${items.length} detail files to items/`);

  // 1.6 历史详情 JSON 同步 isFeatured（本轮未新爬的文章，只更新该字段，不重写全文）
  const freshIds = new Set(items.map(i => i.id));
  let patchedCount = 0;
  for (const item of exportItems) {
    if (freshIds.has(item.id)) continue; // 本轮已全量写过
    const detailPath = join(detailDir, `${item.id}.json`);
    if (!existsSync(detailPath)) continue;
    try {
      const detail = JSON.parse(readFileSync(detailPath, 'utf-8'));
      if (detail.isFeatured !== item.isFeatured) {
        detail.isFeatured = item.isFeatured;
        writeFileSync(detailPath, JSON.stringify(detail, null, 2));
        patchedCount++;
      }
    } catch { /* 跳过损坏文件 */ }
  }
  if (patchedCount > 0) console.log(`Patched isFeatured in ${patchedCount} historical detail files`);

  // 2. 导出热点条目
  const hotItems = await prisma.item.findMany({
    where: { isHot: true, isRelevant: true },
    orderBy: { qualityScore: 'desc' },
    take: 5,
  });

  const exportHotItems: ExportHotItem[] = hotItems.map(item => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh,
    url: item.url,
    multiSourceCount: item.multiSourceCount,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : '',
    qualityScore: item.qualityScore,
  }));

  writeFileSync(join(OUTPUT_DIR, 'hot-items.json'), JSON.stringify(exportHotItems, null, 2));
  console.log(`Exported ${exportHotItems.length} hot items`);

  // 3. 导出统计数据
  // featured 用重算后的真实精选数（阈值+百分位），不再用 qualityScore>=60 的旧口径
  const [sourceCount, itemCount, hotCount] = await Promise.all([
    prisma.source.count({ where: { isActive: true } }),
    prisma.item.count({ where: { isRelevant: true } }),
    prisma.item.count({ where: { isHot: true } }),
  ]);

  const stats: ExportStats = {
    sources: sourceCount,
    items: itemCount,
    featured: featuredCount,
    hot: hotCount,
    lastUpdated: new Date().toISOString(),
  };

  writeFileSync(join(OUTPUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));
  console.log('Exported stats:', stats);

  // 4. 按分类导出（供分类频道使用）
  const categories = [
    { key: 'pig', filter: (item: ExportItem) => item.species.split(',').includes('pig') || (item as any).subcategory === 'pig' },
    { key: 'poultry', filter: (item: ExportItem) => item.species.split(',').includes('poultry') || (item as any).subcategory === 'poultry' },
    { key: 'cattle', filter: (item: ExportItem) => item.species.split(',').includes('cattle') || (item as any).subcategory === 'cattle' },
    { key: 'sheep', filter: (item: ExportItem) => item.species.split(',').includes('sheep') || (item as any).subcategory === 'sheep' },
    { key: 'field', filter: (item: ExportItem) => (item as any).subcategory === 'field' },
    { key: 'fruit', filter: (item: ExportItem) => (item as any).subcategory === 'fruit' },
    { key: 'horticulture', filter: (item: ExportItem) => (item as any).subcategory === 'horticulture' },
    { key: 'general', filter: (item: ExportItem) => (item as any).subcategory === 'general' },
  ];

  for (const cat of categories) {
    const catItems = exportItems.filter(cat.filter);
    const catHotItems = exportHotItems.filter(item => {
      const originalItem = items.find(i => i.id === item.id);
      return originalItem && cat.filter(originalItem as any);
    });

    writeFileSync(
      join(OUTPUT_DIR, `items-${cat.key}.json`),
      JSON.stringify(catItems, null, 2)
    );
    writeFileSync(
      join(OUTPUT_DIR, `hot-items-${cat.key}.json`),
      JSON.stringify(catHotItems, null, 2)
    );
    console.log(`Exported ${catItems.length} items for ${cat.key}`);
  }

  console.log('\nStatic data exported to public/data/');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
