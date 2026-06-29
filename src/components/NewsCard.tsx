'use client';

import { formatTime, speciesNames, speciesColors } from '@/lib/utils';
import { NewsItem } from './Timeline';
import { BASE_PATH } from '@/lib/config';

interface NewsCardProps {
  item: NewsItem;
}

export function NewsCard({ item }: NewsCardProps) {
  const species = item.species.split(',').filter(Boolean);
  const isFeatured = item.isFeatured || item.qualityScore >= 55;

  return (
    <a
      href={`${BASE_PATH}/detail?id=${item.id}`}
      className="m-row"
    >
      <span className="m-row-time">{formatTime(item.publishedAt)}</span>
      <span className="m-row-dot" />
      <span className="m-row-body">
        <div className="m-row-meta">
          <span className="m-row-src">
            {item.source.nameZh} ({item.source.tier})
          </span>
          {species.map((s) => (
            <span
              key={s}
              className={`tag tag-${s}`}
            >
              {speciesNames[s] || s}
            </span>
          ))}
          {isFeatured && <span className="m-featured-badge">精选</span>}
          <span className="m-score">{Math.round(item.qualityScore)}</span>
        </div>

        {item.titleZh && <div className="m-row-title-zh">{item.titleZh}</div>}
        <div className="m-row-title-en">{item.titleEn}</div>

        {item.featuredReason && (
          <div className="m-row-reason">{item.featuredReason}</div>
        )}

        {item.summaryZh && !item.featuredReason && (
          <div className="m-recommend-box">
            <span className="m-recommend-label">推荐理由：</span>
            {item.summaryZh}
          </div>
        )}
      </span>
    </a>
  );
}
