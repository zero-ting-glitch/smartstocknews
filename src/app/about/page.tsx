'use client';

import { Sidebar } from '@/components/Sidebar';

export default function AboutPage() {
  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--bg-main)' }}>
        <div className="page-header">
          <p style={{ color: 'var(--accent)', fontSize: '13px', marginBottom: '8px' }}>
            关于这个站
          </p>
          <h1 className="page-title">
            嗨，我是 <span style={{ color: 'var(--accent)' }}>SmartStock</span>
          </h1>
          <p className="page-subtitle" style={{ fontSize: '16px', marginTop: '8px' }}>
            这个站是我做的，免费给大家用。
          </p>
        </div>

        <div style={{ padding: '20px', maxWidth: '600px' }}>
          <div style={{ color: 'var(--text-body)', fontSize: '15px', lineHeight: '2', marginTop: '16px' }}>
            <p>每天抓智慧畜牧圈的新动静。</p>
            <p>用 AI 帮我筛掉噪声。</p>
            <p>把真正值得看的几条留下来。</p>
          </div>

          <div style={{
            marginTop: '32px',
            padding: '20px',
            background: 'var(--bg-muted)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              内容边界
            </h2>
            <div style={{ display: 'flex', gap: '32px' }}>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--accent-text)', fontWeight: 600, marginBottom: '8px' }}>
                  做
                </p>
                <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2', listStyle: 'disc', paddingLeft: '16px' }}>
                  <li>IoT、AI、自动化、精准饲喂</li>
                  <li>环境监控、数字孪生、溯源</li>
                  <li>机器人、可穿戴设备</li>
                </ul>
              </div>
              <div>
                <p style={{ fontSize: '13px', color: '#E53935', fontWeight: 600, marginBottom: '8px' }}>
                  不做
                </p>
                <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '2', listStyle: 'disc', paddingLeft: '16px' }}>
                  <li>行情价格</li>
                  <li>单纯疫病防治</li>
                  <li>种植业内容</li>
                </ul>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
            版本：v1.0.0
          </p>
        </div>
      </main>
    </>
  );
}
