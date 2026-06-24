'use client';

import { NewsCard } from './NewsCard';
import { getDateLabel } from '@/lib/utils';

export interface NewsItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  summaryZh: string | null;
  publishedAt: string;
  source: {
    name: string;
    nameZh: string;
    tier: string;
  };
  species: string;
  techTags: string;
  qualityScore: number;
}

interface TimelineProps {
  items: NewsItem[];
}

export function Timeline({ items = [] }: TimelineProps) {
  // 按日期分组
  const grouped = items.reduce((acc, item) => {
    const date = new Date(item.publishedAt);
    const key = date.toDateString();
    if (!acc[key]) acc[key] = { date, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { date: Date; items: NewsItem[] }>);

  const groups = Object.values(grouped).sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* 筛选 chips */}
      <div className="m-chips">
        <button className="m-chip is-active">全部</button>
        <button className="m-chip">猪</button>
        <button className="m-chip">禽</button>
        <button className="m-chip">牛</button>
        <button className="m-chip">羊</button>
      </div>

      {/* 时间线 */}
      {groups.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          暂无新闻，点击右上角触发采集
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
