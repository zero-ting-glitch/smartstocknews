'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Timeline, NewsItem } from './Timeline';
import { RightPanel } from './RightPanel';

interface SpeciesPageProps {
  species: string;
  speciesName: string;
}

export function SpeciesPage({ species, speciesName }: SpeciesPageProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hotItems, setHotItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(undefined);

  useEffect(() => {
    fetch(`/data/items-${species}.json`).then(r => r.json()).then(setItems);
    fetch(`/data/hot-items-${species}.json`).then(r => r.json()).then(setHotItems);
    fetch('/data/stats.json').then(r => r.json()).then(setStats);
  }, [species]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="page-header">
          <h1 className="page-title">{speciesName}业智养</h1>
          <p className="page-subtitle">{speciesName}业相关资讯全量信息流</p>
        </div>
        <Timeline items={items} showFilters />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
