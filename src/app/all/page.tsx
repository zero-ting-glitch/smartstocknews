'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Timeline, NewsItem } from '@/components/Timeline';
import { RightPanel } from '@/components/RightPanel';

export default function AllPage() {
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
