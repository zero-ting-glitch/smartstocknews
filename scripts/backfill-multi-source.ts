/**
 * 一次性脚本：回填历史文章的 multiSourceCount
 *
 * 背景：跨源去重逻辑 2026-07-21 修复（见 run-pipeline.ts Step 2），但历史文章当时未参与去重，
 * multiSourceCount 全为 1。本脚本扫描所有 isRelevant=true 的文章，按标题相似度（Jaccard >= 0.6）
 * 聚类，同组文章 multiSourceCount 回填为组大小。
 *
 * 用法: npx tsx scripts/backfill-multi-source.ts
 * 注意: 一次性运行，回填完成后可删除
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/** 并查集（Union-Find）：把相似标题聚成组 */
class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x: number, y: number) {
    this.parent[this.find(x)] = this.find(y);
  }
}

async function main() {
  const items = await prisma.item.findMany({
    where: { isRelevant: true },
    select: { id: true, titleEn: true, multiSourceCount: true },
    orderBy: { publishedAt: 'desc' },
  });
  console.log(`扫描 ${items.length} 篇文章，计算标题相似度聚类...`);

  // 两两比对，并查集聚类
  const uf = new UnionFind(items.length);
  let comparisons = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      comparisons++;
      if (titleSimilarity(items[i].titleEn, items[j].titleEn) >= 0.6) {
        uf.union(i, j);
      }
    }
  }
  console.log(`完成 ${comparisons} 次两两比对`);

  // 按组归类
  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // 回填：组大小 > 1 的，组内每篇 multiSourceCount = 组大小
  let updatedCount = 0;
  let groupCount = 0;
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    groupCount++;
    const size = indices.length;
    console.log(`\n发现多源报道组（${size} 篇）:`);
    for (const idx of indices) {
      const item = items[idx];
      console.log(`  - ${item.titleEn.slice(0, 70)}`);
      if (item.multiSourceCount !== size) {
        await prisma.item.update({
          where: { id: item.id },
          data: { multiSourceCount: size },
        });
        updatedCount++;
      }
    }
  }

  console.log(`\n回填完成：${groupCount} 个多源组，更新 ${updatedCount} 篇文章的 multiSourceCount`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
