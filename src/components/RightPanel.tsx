'use client';

import { HotCard } from './HotCard';
import { StatsCard } from './StatsCard';

interface RightPanelProps {
  hotItems?: Array<{
    id: string;
    titleEn: string;
    titleZh: string | null;
    url: string;
    multiSourceCount: number;
    publishedAt: string;
    qualityScore: number;
  }>;
  stats?: {
    sources: number;
    items: number;
    featured: number;
  };
}

export function RightPanel({ hotItems = [], stats }: RightPanelProps) {
  return (
    <aside className="right-panel">
      <HotCard items={hotItems} />
      <StatsCard stats={stats} />
    </aside>
  );
}
