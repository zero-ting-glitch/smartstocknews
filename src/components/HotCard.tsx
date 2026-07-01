'use client';

import { timeAgo } from '@/lib/utils';

interface HotItem {
  id: string;
  titleEn: string;
  titleZh: string | null;
  url: string;
  multiSourceCount: number;
  publishedAt: string | null;
  qualityScore: number;
}

interface HotCardProps {
  items?: HotItem[];
}

export function HotCard({ items = [] }: HotCardProps) {
  return (
    <div className="m-hotcard">
      <div className="m-hotcard-head">
        <span className="m-hotcard-title">🔥 当前热点</span>
        <span className="m-hotcard-top5">TOP 5</span>
      </div>
      <div className="m-hotcard-subtitle">多信源热度·随时间消退</div>

      {items.length === 0 ? (
        <div className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          暂无热点
        </div>
      ) : (
        <ol className="m-hotcard-list">
          {items.map((item, index) => (
            <li key={item.id} className="m-hotcard-row">
              <span className={`m-hotcard-rank ${index === 0 ? 'm-hotcard-rank-1' : ''}`}>
                {index + 1}
              </span>
              <a
                href={item.url.startsWith('http') ? item.url : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="m-hotcard-link"
              >
                {item.titleZh || item.titleEn}
              </a>
              <span className="m-hotcard-count">
                {item.multiSourceCount} 信源 · {timeAgo(item.publishedAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
