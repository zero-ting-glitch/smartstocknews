'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Timeline, NewsItem } from '@/components/Timeline';
import { RightPanel } from '@/components/RightPanel';
import { BASE_PATH } from '@/lib/config';

export default function Home() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hotItems, setHotItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(undefined);

  useEffect(() => {
    fetch(`${BASE_PATH}/data/items.json`).then(r => r.json()).then(setItems);
    fetch(`${BASE_PATH}/data/hot-items.json`).then(r => r.json()).then(setHotItems);
    fetch(`${BASE_PATH}/data/stats.json`).then(r => r.json()).then(setStats);
  }, []);

  const featuredItems = useMemo(() => items.filter(item => item.isFeatured), [items]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="page-header">
          <h1 className="page-title">精选</h1>
          <p className="page-subtitle">智慧农业的高价值内容</p>
        </div>
        <Timeline items={featuredItems} showFilters />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
