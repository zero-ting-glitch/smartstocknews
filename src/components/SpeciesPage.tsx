'use client';

import { Sidebar } from './Sidebar';
import { Timeline } from './Timeline';
import { RightPanel } from './RightPanel';

interface SpeciesPageProps {
  species: string;
  speciesName: string;
  items?: Array<{
    id: string;
    titleEn: string;
    titleZh: string | null;
    url: string;
    summaryZh: string | null;
    publishedAt: Date;
    source: {
      name: string;
      nameZh: string;
      tier: string;
    };
    species: string;
    techTags: string;
    qualityScore: number;
  }>;
  hotItems?: Array<{
    id: string;
    titleEn: string;
    titleZh: string | null;
    url: string;
    multiSourceCount: number;
    publishedAt: Date;
    qualityScore: number;
  }>;
  stats?: {
    sources: number;
    items: number;
    featured: number;
  };
}

export function SpeciesPage({ species, speciesName, items = [], hotItems = [], stats }: SpeciesPageProps) {
  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {speciesName}业智养
          </h1>
        </div>
        <Timeline items={items} />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
