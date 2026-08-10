'use client';

/**
 * 通用列表页（client 组件）
 *
 * 初始数据由 Server Component 通过 SSG 注入（首帧即有完整列表），
 * 挂载后后台 fetch 最新数据无感刷新（dev 模式数据文件变更时有用，
 * 生产静态站数据与构建一致，fetch 回来相同内容不产生差异渲染）。
 */
import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Timeline, NewsItem } from './Timeline';
import { RightPanel } from './RightPanel';
import { BASE_PATH } from '@/lib/config';

interface ListPageClientProps {
  title: string;
  subtitle: string;
  initialItems: NewsItem[];
  initialHotItems: any[];
  initialStats: any;
  /** 后台刷新的数据地址 */
  itemsUrl: string;
  hotItemsUrl: string;
  /** 主页专用：只显示精选 */
  filterFeatured?: boolean;
  /** 频道页专用：默认选中的物种筛选 */
  initialSpecies?: string;
}

export function ListPageClient({
  title,
  subtitle,
  initialItems,
  initialHotItems,
  initialStats,
  itemsUrl,
  hotItemsUrl,
  filterFeatured = false,
  initialSpecies,
}: ListPageClientProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems);
  const [hotItems, setHotItems] = useState<any[]>(initialHotItems);
  const [stats, setStats] = useState<any>(initialStats);

  useEffect(() => {
    fetch(itemsUrl).then(r => r.json()).then(setItems).catch(() => {});
    fetch(hotItemsUrl).then(r => r.json()).then(setHotItems).catch(() => {});
    fetch(`${BASE_PATH}/data/stats.json`).then(r => r.json()).then(setStats).catch(() => {});
  }, [itemsUrl, hotItemsUrl]);

  const displayItems = useMemo(
    () => (filterFeatured ? items.filter(item => item.isFeatured) : items),
    [items, filterFeatured]
  );

  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <Timeline items={displayItems} showFilters initialSpecies={initialSpecies} />
      </main>
      <RightPanel hotItems={hotItems} stats={stats} />
    </>
  );
}
