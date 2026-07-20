'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { BASE_PATH } from '@/lib/config';
import { speciesNames, speciesColors } from '@/lib/utils';
import { ReactNode } from 'react';

function renderBoldText(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

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

/* ===== 图片分类与布局引擎 ===== */

type ImgKind = 'decor' | 'small' | 'big';

interface ClassifiedImg {
  url: string;
  kind: ImgKind;
  ratio: number; // w / h
}

/** 仅从 URL 判断装饰图（头像/logo/icon/追踪像素/栏目品牌图等） */
function isDecorByUrl(url: string): boolean {
  const u = url.toLowerCase();
  return /avatar|logo|icon|sprite|pixel|tracking|badge|button|emoji|blank|spacer|1x1|favicon|gravatar|the-signal|banner|header-|wordmark|brand/.test(u);
}

/** 依据加载后的真实尺寸分类 */
function classifyBySize(url: string, w: number, h: number): ImgKind {
  if (isDecorByUrl(url)) return 'decor';
  if (w < 200 || h < 120) return 'decor';
  const ratio = w / h;
  // 极端比例：细长 banner / 竖长条
  if (ratio > 5 || ratio < 0.35) return 'decor';
  if (w < 420) return 'small';
  return 'big';
}

type GalleryLayout =
  | { type: 'hero'; hero: ClassifiedImg; rest: ClassifiedImg[] }
  | { type: 'duo'; imgs: ClassifiedImg[] }
  | { type: 'duo-plus'; bigs: ClassifiedImg[]; smalls: ClassifiedImg[] }
  | { type: 'pin'; big: ClassifiedImg; smalls: ClassifiedImg[] }
  | { type: 'small-row'; imgs: ClassifiedImg[] }
  | { type: 'masonry'; imgs: ClassifiedImg[] };

function decideLayout(imgs: ClassifiedImg[]): GalleryLayout | null {
  if (imgs.length === 0) return null;
  const bigs = imgs.filter((i) => i.kind === 'big');
  const smalls = imgs.filter((i) => i.kind === 'small');

  if (imgs.length === 1) {
    const only = imgs[0];
    return only.kind === 'big'
      ? { type: 'hero', hero: only, rest: [] }
      : { type: 'small-row', imgs: [only] };
  }

  if (imgs.length === 2) {
    if (bigs.length === 2) return { type: 'duo', imgs };
    if (bigs.length === 1) return { type: 'pin', big: bigs[0], smalls };
    return { type: 'small-row', imgs };
  }

  if (imgs.length === 3) {
    if (bigs.length === 3) return { type: 'masonry', imgs };
    if (bigs.length === 2) {
      // 2 大 1 小：两大并排 duo，小图在下居中
      return { type: 'duo-plus', bigs, smalls };
    }
    if (bigs.length === 1) return { type: 'pin', big: bigs[0], smalls };
    return { type: 'small-row', imgs };
  }

  // ≥4 张：大图领衔 hero + 其余 masonry
  if (bigs.length >= 1) {
    return { type: 'hero', hero: bigs[0], rest: [...bigs.slice(1), ...smalls] };
  }
  return { type: 'masonry', imgs };
}

function DetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgDims, setImgDims] = useState<Record<string, { w: number; h: number }>>({});
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    setImgDims({});
    setImgFailed({});
    setLightbox(null);
  }, [item?.id]);

  // lightbox：ESC 关闭 + 锁定滚动
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox]);

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

  const translationParagraphs = (() => {
    if (!item.translationZh) return [];
    let paras = item.translationZh.split(/\n{2,}/).filter(Boolean);
    if (paras.length <= 1) {
      paras = item.translationZh.split(/\n/).filter(Boolean);
    }
    if (paras.length <= 1 && item.translationZh.length > 200) {
      const sentences = item.translationZh.split(/(?<=[。！？])/);
      paras = [];
      for (let i = 0; i < sentences.length; i += 3) {
        paras.push(sentences.slice(i, i + 3).join(''));
      }
    }
    return paras;
  })();

  /* ===== 图片分类：乐观渲染，渐进修正 ===== */
  const rawImgs = (item.images || []).filter(
    (img): img is string => typeof img === 'string' && img.startsWith('http')
  );
  // URL 可判定装饰图的直接过滤；裂图只藏它自己
  const candidateImgs = rawImgs.filter((u) => !isDecorByUrl(u) && !imgFailed[u]);

  /**
   * 分类策略：
   * - 已有真实尺寸 → 精确分类（decor 摘除、small/big）
   * - 未加载 → 按序号乐观假设：第 1 张视作 big（通常为主图），其余视作 big 进入瀑布流，
   *           真实尺寸回来后再修正。保证任何情况下图片立刻可见，不被加载状态阻塞。
   */
  const classified: ClassifiedImg[] = candidateImgs
    .map((u, idx) => {
      const dims = imgDims[u];
      if (dims) {
        const kind = classifyBySize(u, dims.w, dims.h);
        return { url: u, kind, ratio: dims.w / dims.h };
      }
      // 未测出尺寸：乐观按 big 处理（保证可见，绝不因等待而消失）
      return { url: u, kind: 'big' as ImgKind, ratio: 16 / 9 };
    })
    .filter((c) => c.kind !== 'decor');

  const layout = decideLayout(classified);
  // hero 图（用于正文穿插）：布局为 hero 时的领衔大图
  const heroImg = layout?.type === 'hero' ? layout.hero : null;
  const showInlineHero = heroImg !== null && translationParagraphs.length >= 3;

  const registerImg = (url: string) => ({
    onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
      setImgDims((prev) => (prev[url] ? prev : { ...prev, [url]: { w, h } }));
    },
    onError: () => {
      setImgFailed((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
    },
  });

  /** gallery 中的单图：带尺寸上报 + 裂图自隐藏；isLastOdd 标记 masonry 单数末尾图 */
  const renderGalleryImg = (img: ClassifiedImg, cls: string, isLastOdd = false) => (
    <figure
      key={img.url}
      className={`dg-item ${cls}${isLastOdd ? ' dg-last-odd' : ''}`}
      onClick={() => setLightbox(img.url)}
    >
      <img src={img.url} alt="" className="dg-img" loading="lazy" {...registerImg(img.url)} />
    </figure>
  );

  /** masonry 渲染：单数时最后一张居中独占一行 */
  const renderMasonry = (imgs: ClassifiedImg[]) => {
    const isOdd = imgs.length % 2 === 1;
    return (
      <div className={`dg-masonry${isOdd ? ' is-odd' : ''}`}>
        {imgs.map((img, i) => renderGalleryImg(img, '', isOdd && i === imgs.length - 1))}
      </div>
    );
  };

  /** 图片组渲染（正文后的 gallery；hero 模式不含领衔图，因为领衔图穿插进正文了） */
  const renderGallery = () => {
    if (!layout) return null;
    switch (layout.type) {
      case 'hero':
        return (
          <>
            {!showInlineHero && (
              <figure className="dg-hero" onClick={() => setLightbox(layout.hero.url)}>
                <img src={layout.hero.url} alt="" className="dg-img" {...registerImg(layout.hero.url)} />
              </figure>
            )}
            {layout.rest.length > 0 && renderMasonry(layout.rest)}
          </>
        );
      case 'duo':
        return <div className="dg-duo">{layout.imgs.map((img) => renderGalleryImg(img, ''))}</div>;
      case 'duo-plus':
        return (
          <div className="dg-duo-plus">
            <div className="dg-duo">
              {layout.bigs.map((img) => renderGalleryImg(img, ''))}
            </div>
            <div className="dg-pin-smalls">
              {layout.smalls.map((img) => renderGalleryImg(img, 'dg-pin-small'))}
            </div>
          </div>
        );
      case 'pin':
        return (
          <div className="dg-pin">
            <figure className="dg-item dg-pin-big" onClick={() => setLightbox(layout.big.url)}>
              <img src={layout.big.url} alt="" className="dg-img" loading="lazy" {...registerImg(layout.big.url)} />
            </figure>
            <div className="dg-pin-smalls">
              {layout.smalls.map((img) => renderGalleryImg(img, 'dg-pin-small'))}
            </div>
          </div>
        );
      case 'small-row':
        return (
          <div className="dg-small-row">
            {layout.imgs.map((img) => renderGalleryImg(img, 'dg-small-item'))}
          </div>
        );
      case 'masonry':
        return renderMasonry(layout.imgs);
    }
  };

  /** 正文段落 + 首图穿插：翻译模式下把 hero 图插到第 2 段后 */
  const renderBodyWithInlineImage = () => {
    const isZh = !showOriginal && item.translationZh;
    const paras = isZh ? translationParagraphs : contentParagraphs;
    if (!showInlineHero || !isZh) {
      // 原文模式或无 hero：纯段落
      return paras.map((p, i) => <p key={i}>{isZh ? renderBoldText(p) : p}</p>);
    }
    const out: ReactNode[] = [];
    paras.forEach((p, i) => {
      out.push(<p key={i}>{renderBoldText(p)}</p>);
      if (i === 1) {
        out.push(
          <figure key="__hero__" className="dg-hero dg-hero-inline" onClick={() => setLightbox(heroImg!.url)}>
            <img src={heroImg!.url} alt="" className="dg-img" {...registerImg(heroImg!.url)} />
          </figure>
        );
      }
    });
    return out;
  };

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
            {item.publishedAt && (() => {
              const d = new Date(item.publishedAt);
              return d.getTime() > 0 ? (
                <span>{d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })} {d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              ) : null;
            })()}
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

          {/* AI 翻译 / 原文切换（正文内含首图穿插） */}
          {(item.contentFull || item.translationZh) && (
            <div className="detail-translation">
              <div className="detail-translation-header">
                <span className="detail-translation-label">
                  {item.translationZh ? 'AI 翻译 · 中文' : '原文'}
                </span>
                {item.translationZh && item.contentFull && (
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="detail-toggle-btn"
                  >
                    {showOriginal ? '显示中文' : '显示原文'}
                  </button>
                )}
              </div>
              <div className="detail-translation-content">
                {renderBodyWithInlineImage()}
              </div>
            </div>
          )}

          {/* 图片组（正文之后；hero 穿插且无剩余图时不渲染空容器） */}
          {layout && !(layout.type === 'hero' && showInlineHero && layout.rest.length === 0) && (
            <div className="detail-gallery">{renderGallery()}</div>
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

        {/* Lightbox */}
        {lightbox && (
          <div className="dg-lightbox" onClick={() => setLightbox(null)}>
            <button className="dg-lightbox-close" aria-label="关闭">
              ✕
            </button>
            <img
              src={lightbox}
              alt=""
              className="dg-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
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
