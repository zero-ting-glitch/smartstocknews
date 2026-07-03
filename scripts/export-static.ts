/**
 * 从 SQLite 数据库导出静态 JSON 文件到 public/data/
 * 用于 Cloudflare Pages 部署（前端静态托管）
 *
 * 用法: npx tsx scripts/export-static.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const OUTPUT_DIR = join(process.cwd(), 'public', 'data');

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
  };
  species: string;
  category: string | null;
  subcategory: string | null;
  techTags: string;
  qualityScore: number;
  isHot: boolean;
  multiSourceCount: number;
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

// 合并：新数据按 ID 覆盖旧数据，旧数据中未出现的 ID 保留
function mergeItems(existing: ExportItem[], fresh: ExportItem[]): ExportItem[] {
  const map = new Map<string, ExportItem>();
  for (const item of existing) map.set(item.id, item);
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
    include: { source: { select: { name: true, nameZh: true, tier: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 200,
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
  const exportItems = mergeItems(existingItems, freshItems);
  const preserved = exportItems.length - freshItems.length;
  writeFileSync(join(OUTPUT_DIR, 'items.json'), JSON.stringify(exportItems, null, 2));
  console.log(`Exported ${exportItems.length} items (${freshItems.length} new + ${preserved} preserved from previous run)`);

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
      contentHtml: item.contentHtml || '',
      scrapeMethod: item.scrapeMethod || 'rss',
    };
    writeFileSync(join(detailDir, `${item.id}.json`), JSON.stringify(detail, null, 2));
  }
  console.log(`Exported ${items.length} detail files to items/`);

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
  const [sourceCount, itemCount, featuredCount, hotCount] = await Promise.all([
    prisma.source.count({ where: { isActive: true } }),
    prisma.item.count({ where: { isRelevant: true } }),
    prisma.item.count({ where: { isRelevant: true, qualityScore: { gte: 60 } } }),
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
