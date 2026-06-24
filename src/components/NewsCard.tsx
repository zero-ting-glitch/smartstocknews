'use client';

import { timeAgo, speciesNames, speciesColors, tierColors } from '@/lib/utils';
import { NewsItem } from './Timeline';

interface NewsCardProps {
  item: NewsItem;
}

export function NewsCard({ item }: NewsCardProps) {
  const publishDate = new Date(item.publishedAt);
  const species = item.species.split(',').filter(Boolean);
  const techTags = item.techTags.split(',').filter(Boolean);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="m-row"
    >
      <span className="m-row-time">{timeAgo(publishDate)}</span>
      <span className="m-row-body">
        <span className="m-row-meta">
          <span className="m-row-src">
            {item.source.nameZh} ({item.source.tier})
          </span>
          {species.map(s => (
            <span
              key={s}
              className={`tag tag-${s}`}
              style={{ color: speciesColors[s] }}
            >
              {speciesNames[s] || s}
            </span>
          ))}
          <span className="m-score">{Math.round(item.qualityScore)}</span>
        </span>

        <div className="m-row-title-en">{item.titleEn}</div>
        {item.titleZh && <div className="m-row-title-zh">{item.titleZh}</div>}

        {item.summaryZh && (
          <div className="m-row-reason">{item.summaryZh}</div>
        )}

        {techTags.length > 0 && (
          <div className="m-row-tags">
            {techTags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </span>
    </a>
  );
}
