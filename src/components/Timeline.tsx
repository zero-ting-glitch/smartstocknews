'use client';

import { useState, useMemo } from 'react';
import { NewsCard } from './NewsCard';
import { getDateLabel } from '@/lib/utils';

export interface NewsItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  summaryZh: string | null;
  featuredReason: string | null;
  publishedAt: string | null;
  source: {
    name: string;
    nameZh: string;
    tier: string;
  };
  species: string;
  category: string;
  subcategory: string;
  techTags: string;
  qualityScore: number;
  isFeatured: boolean;
}

interface TimelineProps {
  items: NewsItem[];
  showFilters?: boolean;
  initialSpecies?: string;
}

const SPECIES_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pig', label: '猪' },
  { key: 'poultry', label: '禽' },
  { key: 'cattle', label: '牛' },
  { key: 'sheep', label: '羊' },
  { key: 'field', label: '大田' },
  { key: 'fruit', label: '果蔬' },
  { key: 'horticulture', label: '园艺' },
];

const TECH_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'iot', label: 'IoT' },
  { key: 'ai', label: 'AI' },
  { key: 'automation', label: '自动化' },
  { key: 'robot', label: '机器人' },
  { key: 'sensor', label: '传感器' },
];

export function Timeline({ items = [], showFilters = false, initialSpecies }: TimelineProps) {
  const [speciesFilter, setSpeciesFilter] = useState(initialSpecies || 'all');
  const [techFilter, setTechFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 物种筛选（畜牧业用species，种植业用subcategory）
      if (speciesFilter !== 'all') {
        const inSpecies = item.species.split(',').includes(speciesFilter);
        const inSubcategory = item.subcategory === speciesFilter;
        if (!inSpecies && !inSubcategory) return false;
      }
      // 技术筛选
      if (techFilter !== 'all') {
        const tags = item.techTags.split(',').map(t => t.toLowerCase());
        if (!tags.includes(techFilter)) return false;
      }
      // 搜索
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.titleEn.toLowerCase().includes(q);
        const matchTitleZh = item.titleZh?.toLowerCase().includes(q);
        const matchSummary = item.summaryZh?.toLowerCase().includes(q);
        if (!matchTitle && !matchTitleZh && !matchSummary) return false;
      }
      return true;
    });
  }, [items, speciesFilter, techFilter, searchQuery]);

  // 按日期分组（无日期的归入"未知日期"组）
  const grouped = filteredItems.reduce((acc, item) => {
    const date = item.publishedAt ? new Date(item.publishedAt) : null;
    const isValidDate = date && !isNaN(date.getTime());
    const key = isValidDate ? date!.toDateString() : 'unknown';
    if (!acc[key]) acc[key] = { date: isValidDate ? date! : new Date(0), items: [] };
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { date: Date; items: NewsItem[] }>);

  const groups = Object.values(grouped).sort((a, b) => {
    if (a.date.getTime() === 0) return 1;
    if (b.date.getTime() === 0) return -1;
    return b.date.getTime() - a.date.getTime();
  });

  return (
    <div>
      {/* 筛选区 */}
      {showFilters && (
        <>
          <div className="m-chips">
            {SPECIES_FILTERS.map(f => (
              <button
                key={f.key}
                className={`m-chip ${speciesFilter === f.key ? 'is-active' : ''}`}
                onClick={() => setSpeciesFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <div className="m-search">
              <input
                type="text"
                className="m-search-input"
                placeholder="搜索标题/摘要..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="m-chips" style={{ paddingTop: 0 }}>
            {TECH_FILTERS.map(f => (
              <button
                key={f.key}
                className={`m-chip ${techFilter === f.key ? 'is-active' : ''}`}
                onClick={() => setTechFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 时间线 */}
      {groups.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          暂无新闻
        </div>
      ) : (
        groups.map(group => {
          const label = getDateLabel(group.date);
          return (
            <div key={group.date.toDateString()} className="m-daygroup">
              <div className="m-daybar">
                <span className="m-daybar-main">{label.main}</span>
                {label.sub && <span className="m-daybar-sub">{label.sub}</span>}
              </div>
              <div>
                {group.items.map(item => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
