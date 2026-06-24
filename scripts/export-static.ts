/**
 * 从 SQLite 数据库导出静态 JSON 文件到 public/data/
 * 用于 Cloudflare Pages 部署（前端静态托管）
 *
 * 用法: npx tsx scripts/export-static.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const OUTPUT_DIR = join(process.cwd(), 'public', 'data');

interface ExportItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  summaryZh: string | null;
  publishedAt: string;
  source: {
    name: string;
    nameZh: string;
    tier: string;
  };
  species: string;
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

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. 导出所有相关条目
  const items = await prisma.item.findMany({
    where: { isRelevant: true },
    include: { source: { select: { name: true, nameZh: true, tier: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });

  const exportItems: ExportItem[] = items.map(item => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh,
    url: item.url,
    summaryZh: item.summaryZh,
    publishedAt: item.publishedAt.toISOString(),
    source: item.source,
    species: item.species,
    techTags: item.techTags,
    qualityScore: item.qualityScore,
    isHot: item.isHot,
    multiSourceCount: item.multiSourceCount,
  }));

  writeFileSync(join(OUTPUT_DIR, 'items.json'), JSON.stringify(exportItems, null, 2));
  console.log(`Exported ${exportItems.length} items`);

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
    publishedAt: item.publishedAt.toISOString(),
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

  // 4. 按物种导出（供物种频道使用）
  const species = ['pig', 'poultry', 'cattle', 'sheep'];
  for (const sp of species) {
    const spItems = exportItems.filter(item =>
      item.species.split(',').includes(sp)
    );
    const spHotItems = exportHotItems.filter(item => {
      // 热点条目也需要按物种筛选，但 exportHotItem 没有 species 字段
      // 从原始 items 中查找
      return items.find(i => i.id === item.id && i.species.split(',').includes(sp));
    });

    writeFileSync(
      join(OUTPUT_DIR, `items-${sp}.json`),
      JSON.stringify(spItems, null, 2)
    );
    writeFileSync(
      join(OUTPUT_DIR, `hot-items-${sp}.json`),
      JSON.stringify(spHotItems, null, 2)
    );
    console.log(`Exported ${spItems.length} items for ${sp}`);
  }

  console.log('\nStatic data exported to public/data/');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
