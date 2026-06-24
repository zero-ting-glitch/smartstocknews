'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Timeline, NewsItem } from '@/components/Timeline';
import { RightPanel } from '@/components/RightPanel';

export default function Home() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hotItems, setHotItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(undefined);

  useEffect(() => {
    fetch('/data/items.json').then(r => r.json()).then(setItems);
    fetch('/data/hot-items.json').then(r => r.json()).then(setHotItems);
    fetch('/data/stats.json').then(r => r.json()).then(setStats);
  }, []);

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <Timeline items={items} />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
