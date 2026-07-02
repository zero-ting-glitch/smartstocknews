'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Timeline, NewsItem } from './Timeline';
import { RightPanel } from './RightPanel';
import { BASE_PATH } from '@/lib/config';

interface SpeciesPageProps {
  species: string;
  speciesName: string;
}

export function SpeciesPage({ species, speciesName }: SpeciesPageProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hotItems, setHotItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(undefined);

  useEffect(() => {
    fetch(`${BASE_PATH}/data/items-${species}.json`).then(r => r.json()).then(setItems);
    fetch(`${BASE_PATH}/data/hot-items-${species}.json`).then(r => r.json()).then(setHotItems);
    fetch(`${BASE_PATH}/data/stats.json`).then(r => r.json()).then(setStats);
  }, [species]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="page-header">
          <h1 className="page-title">{speciesName}业智养</h1>
          <p className="page-subtitle">{speciesName}业相关资讯全量信息流</p>
        </div>
        <Timeline items={items} showFilters initialSpecies={species} />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
