'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { BASE_PATH } from '@/lib/config';
import { speciesNames, speciesColors } from '@/lib/utils';

interface ItemDetail {
  id: string;
  titleEn: string;
  titleZh: string;
  summaryZh: string;
  featuredReason: string;
  url: string;
  source: { name: string; nameZh: string; tier: string };
  species: string;
  category: string;
  subcategory: string;
  techTags: string;
  qualityScore: number;
  isFeatured: boolean;
  publishedAt: string;
  contentFull: string;
  translationZh: string;
  images: string[];
  author: string;
}

function DetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      setLoading(false);
      return;
    }
    fetch(`${BASE_PATH}/data/items/${encodeURIComponent(id)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return (
      <>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
          <div className="detail-page">
            <div className="detail-not-found">
              <h2>请从文章列表进入</h2>
              <a href={`${BASE_PATH}/`}>返回首页</a>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
          <div className="detail-page">
            <div className="detail-loading">加载中...</div>
          </div>
        </main>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
          <div className="detail-page">
            <div className="detail-not-found">
              <h2>文章未找到</h2>
              <a href={`${BASE_PATH}/`}>返回首页</a>
            </div>
          </div>
        </main>
      </>
    );
  }

  const species = item.species.split(',').filter(Boolean);
  const contentParagraphs = item.contentFull
    ? item.contentFull.split(/\n{2,}/).filter(Boolean)
    : [];

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="detail-page">
          {/* 返回栏 */}
          <nav className="detail-nav">
            <button onClick={() => history.back()} className="detail-back">
              ← 返回
            </button>
          </nav>

          {/* 来源 + 标签 */}
          <div className="detail-meta">
            <span className="detail-source">{item.source.nameZh}</span>
            <span className={`detail-tier detail-tier-${item.source.tier.toLowerCase().replace('.', '')}`}>
              {item.source.tier}
            </span>
            <span className="detail-score">{Math.round(item.qualityScore)}</span>
            {item.isFeatured && <span className="detail-featured-badge">精选</span>}
          </div>

          {/* 标题 */}
          {item.titleZh && <h1 className="detail-title-zh">{item.titleZh}</h1>}
          <h2 className="detail-title-en">{item.titleEn}</h2>

          {/* 元信息 */}
          <div className="detail-info">
            {item.author && <span>作者: {item.author}</span>}
            <span>{new Date(item.publishedAt).toLocaleDateString('zh-CN')}</span>
            {species.map((s) => (
              <span
                key={s}
                className="detail-species-tag"
                style={{ color: speciesColors[s] || '#666' }}
              >
                {speciesNames[s] || s}
              </span>
            ))}
          </div>

          {/* 精选理由 */}
          {item.featuredReason && (
            <div className="detail-featured-reason">
              <span className="detail-section-label detail-section-label-amber">精选理由</span>
              <p>{item.featuredReason}</p>
            </div>
          )}

          {/* AI 摘要 */}
          {item.summaryZh && (
            <div className="detail-summary">
              <span className="detail-section-label detail-section-label-blue">AI 摘要</span>
              <p>{item.summaryZh}</p>
            </div>
          )}

          {/* AI 翻译 / 原文切换 */}
          {item.contentFull && (
            <div className="detail-translation">
              <div className="detail-translation-header">
                <span className="detail-translation-label">
                  {item.translationZh ? 'AI 翻译 · 中文' : '原文'}
                </span>
                {item.translationZh && (
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="detail-toggle-btn"
                  >
                    {showOriginal ? '显示中文' : '显示原文'}
                  </button>
                )}
              </div>
              <div className="detail-translation-content">
                {showOriginal || !item.translationZh ? (
                  contentParagraphs.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  item.translationZh.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
                )}
              </div>
            </div>
          )}

          {/* 文章图片 */}
          {item.images && item.images.length > 0 && (
            <div className="detail-images">
              {item.images
                .filter((img) => typeof img === 'string' && img.startsWith('http'))
                .slice(0, 3)
                .map((img, i) => (
                  <img key={i} src={img} alt="" className="detail-image" loading="lazy" />
                ))}
            </div>
          )}

          {/* 技术标签 */}
          {item.techTags && (
            <div className="detail-tags">
              {item.techTags.split(',').filter(Boolean).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 阅读原文 */}
          <div className="detail-actions">
            <a
              href={item.url.startsWith('http') ? item.url : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-read-original"
            >
              阅读原文 →
            </a>
          </div>
        </div>
      </main>
    </>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={
      <>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
          <div className="detail-page">
            <div className="detail-loading">加载中...</div>
          </div>
        </main>
      </>
    }>
      <DetailContent />
    </Suspense>
  );
}
