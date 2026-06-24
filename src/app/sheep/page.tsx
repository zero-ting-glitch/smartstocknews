import { SpeciesPage } from '@/components/SpeciesPage';
import { db } from '@/lib/db';

async function getItems() {
  const items = await db.item.findMany({
    where: { isRelevant: true, species: 'sheep' },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });
  return items;
}

async function getHotItems() {
  const items = await db.item.findMany({
    where: { isHot: true, isRelevant: true, species: 'sheep' },
    include: { source: true },
    orderBy: { qualityScore: 'desc' },
    take: 5,
  });
  return items;
}

async function getStats() {
  const [sourceCount, itemCount, featuredCount] = await Promise.all([
    db.source.count({ where: { isActive: true, species: { contains: 'sheep' } } }),
    db.item.count({ where: { isRelevant: true, species: 'sheep' } }),
    db.item.count({ where: { isRelevant: true, species: 'sheep', qualityScore: { gte: 60 } } }),
  ]);
  return { sources: sourceCount, items: itemCount, featured: featuredCount };
}

export default async function SheepPage() {
  const [items, hotItems, stats] = await Promise.all([
    getItems(),
    getHotItems(),
    getStats(),
  ]);

  return <SpeciesPage species="sheep" speciesName="羊" items={items} hotItems={hotItems} stats={stats} />;
}
