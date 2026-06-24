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
        <div className="page-header">
          <h1 className="page-title">全部动态</h1>
          <p className="page-subtitle">智慧畜牧相关资讯全量信息流</p>
        </div>
        <Timeline items={items} showFilters />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
