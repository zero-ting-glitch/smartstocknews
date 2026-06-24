'use client';

interface StatsCardProps {
  stats?: {
    sources: number;
    items: number;
    featured: number;
  };
}

export function StatsCard({ stats }: StatsCardProps) {
  return (
    <div className="stats-card">
      <div className="stats-title">📊 信源统计</div>
      <div className="stats-item">
        <span>📡 信源数</span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats?.sources ?? 8}</span>
      </div>
      <div className="stats-item">
        <span>📰 新闻数</span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats?.items ?? 0}</span>
      </div>
      <div className="stats-item">
        <span>🎯 精选数</span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats?.featured ?? 0}</span>
      </div>
    </div>
  );
}
