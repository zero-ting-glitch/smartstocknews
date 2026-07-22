'use client';

import { Sidebar } from '@/components/Sidebar';

export default function AboutPage() {
  return (
    <>
      <Sidebar />
      <main className="flex-1 min-h-screen" style={{ background: 'var(--m-bg)' }}>
        <div className="page-header" style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <p style={{ color: 'var(--m-ink-muted)', fontSize: '13px', marginBottom: '8px' }}>
            关于
          </p>
          <h1 className="page-title">
            嗨，我是 <span style={{ color: 'var(--m-brand)' }}>Zephyrry</span>
          </h1>
          <p className="page-subtitle" style={{ fontSize: '16px', marginTop: '8px' }}>
            做了这个小站，免费开源，给关心农业科技的人看。
          </p>
        </div>

        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 24px 60px', width: '100%' }}>
          {/* 一句话介绍 */}
          <div style={{
            background: 'linear-gradient(135deg, var(--m-brand-weak) 0%, rgba(14, 116, 144, 0.03) 100%)',
            borderRadius: 'var(--m-radius-card)',
            border: '1px solid var(--m-border)',
            padding: '28px 32px',
            marginTop: '8px',
          }}>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '16px',
              lineHeight: '2',
              color: 'var(--m-ink)',
              margin: 0,
            }}>
              <strong style={{ fontFamily: 'Outfit, var(--font-body)', fontWeight: 700, color: 'var(--m-brand)' }}>
                SmartStock
              </strong>
              {' '}是一个智慧农业信息聚合站 —— 每天追踪全球农业科技新动态，
              用 AI 筛选、评分、翻译，把真正值得看的内容从噪声中捞出来。
            </p>
          </div>

          {/* 内容边界 */}
          <div style={{
            marginTop: '20px',
            padding: '28px 32px',
            background: 'var(--m-surface)',
            borderRadius: 'var(--m-radius-card)',
            border: '1px solid var(--m-border)',
            boxShadow: 'var(--m-shadow-card)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--m-ink)', marginBottom: '20px' }}>
              内容边界
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--m-brand)', fontWeight: 600, marginBottom: '10px' }}>
                  ✅ 做
                </p>
                <ul style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', color: 'var(--m-ink)', lineHeight: '2.2', listStyle: 'disc', paddingLeft: '16px', margin: 0 }}>
                  <li>精准农业、无人机、卫星遥感</li>
                  <li>IoT 传感器、环境监控、数字孪生</li>
                  <li>AI 决策、机器学习、计算机视觉</li>
                  <li>自动化、机器人、可穿戴设备</li>
                  <li>育种基因、健康监测、疾病检测</li>
                  <li>智慧牧场、精准饲喂、自动挤奶</li>
                  <li>智慧农业相关政策文件、行业会议通知</li>
                </ul>
              </div>
              <div>
                <p style={{ fontSize: '13px', color: '#E53935', fontWeight: 600, marginBottom: '10px' }}>
                  ❌ 不做
                </p>
                <ul style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', color: 'var(--m-ink-soft)', lineHeight: '2.2', listStyle: 'disc', paddingLeft: '16px', margin: 0 }}>
                  <li>行情价格、市场走势</li>
                  <li>单纯疫病防治（无科技含量）</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 技术栈 */}
          <div style={{
            marginTop: '20px',
            padding: '28px 32px',
            background: 'var(--m-surface)',
            borderRadius: 'var(--m-radius-card)',
            border: '1px solid var(--m-border)',
            boxShadow: 'var(--m-shadow-card)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--m-ink)', marginBottom: '16px' }}>
              技术栈
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Next.js', 'TypeScript', 'Tailwind CSS', 'Prisma', 'SQLite', 'DeepSeek API', 'Cheerio', 'Playwright', 'GitHub Pages', 'RSS'].map(tech => (
                <span key={tech} style={{
                  background: 'var(--m-brand-weak)',
                  color: 'var(--m-brand)',
                  padding: '4px 14px',
                  borderRadius: 'var(--m-radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}>
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* 底部 */}
          <div style={{
            marginTop: '32px',
            padding: '20px 0',
            borderTop: '1px solid var(--m-divider)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--m-ink-muted)', margin: 0 }}>
              开源项目 · MIT License
            </p>
            <p style={{ fontSize: '12px', color: 'var(--m-ink-muted)', margin: 0 }}>
              v1.0.0
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
