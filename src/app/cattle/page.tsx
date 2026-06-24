import { SpeciesPage } from '@/components/SpeciesPage';
import { db } from '@/lib/db';

async function getItems() {
  const items = await db.item.findMany({
    where: { isRelevant: true, species: 'cattle' },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });
  return items;
}

async function getHotItems() {
  const items = await db.item.findMany({
    where: { isHot: true, isRelevant: true, species: 'cattle' },
    include: { source: true },
    orderBy: { qualityScore: 'desc' },
    take: 5,
  });
  return items;
}

async function getStats() {
  const [sourceCount, itemCount, featuredCount] = await Promise.all([
    db.source.count({ where: { isActive: true, species: { contains: 'cattle' } } }),
    db.item.count({ where: { isRelevant: true, species: 'cattle' } }),
    db.item.count({ where: { isRelevant: true, species: 'cattle', qualityScore: { gte: 60 } } }),
  ]);
  return { sources: sourceCount, items: itemCount, featured: featuredCount };
}

export default async function CattlePage() {
  const [items, hotItems, stats] = await Promise.all([
    getItems(),
    getHotItems(),
    getStats(),
  ]);

  return <SpeciesPage species="cattle" speciesName="牛" items={items} hotItems={hotItems} stats={stats} />;
}
