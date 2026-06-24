import { Sidebar } from '@/components/Sidebar';
import { Timeline } from '@/components/Timeline';
import { RightPanel } from '@/components/RightPanel';
import { db } from '@/lib/db';

async function getItems() {
  const items = await db.item.findMany({
    where: { isRelevant: true },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  return items;
}

async function getHotItems() {
  const items = await db.item.findMany({
    where: { isHot: true, isRelevant: true },
    include: { source: true },
    orderBy: { qualityScore: 'desc' },
    take: 5,
  });
  return items;
}

async function getStats() {
  const [sourceCount, itemCount, featuredCount] = await Promise.all([
    db.source.count({ where: { isActive: true } }),
    db.item.count({ where: { isRelevant: true } }),
    db.item.count({ where: { isRelevant: true, qualityScore: { gte: 60 } } }),
  ]);
  return { sources: sourceCount, items: itemCount, featured: featuredCount };
}

export default async function AllPage() {
  const [items, hotItems, stats] = await Promise.all([
    getItems(),
    getHotItems(),
    getStats(),
  ]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            全部动态
          </h1>
        </div>
        <Timeline items={items} />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
