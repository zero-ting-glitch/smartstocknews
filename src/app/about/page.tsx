'use client';

import { Sidebar } from '@/components/Sidebar';

export default function AboutPage() {
  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen p-8" style={{ background: 'var(--bg-main)' }}>
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            关于 SmartStock
          </h1>

          <div className="space-y-6" style={{ color: 'var(--text-secondary)' }}>
            <p>
              SmartStock 是一个聚焦智慧畜牧的信息聚合站，专注于 IoT、AI、自动化、机器人等技术在养殖业的应用。
            </p>

            <p>
              我们从海外权威信源采集新闻，通过 AI 评分和人工筛选，为你精选出最值得关注的行业动态。
            </p>

            <div className="p-4 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
              <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                内容边界
              </h2>
              <ul className="list-disc list-inside space-y-1">
                <li>IoT、AI、自动化、精准饲喂</li>
                <li>环境监控、数字孪生、溯源</li>
                <li>机器人、可穿戴设备</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
              <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                不做
              </h2>
              <ul className="list-disc list-inside space-y-1">
                <li>行情价格</li>
                <li>单纯疫病防治</li>
                <li>种植业内容</li>
              </ul>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              版本：v1.0.0
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
