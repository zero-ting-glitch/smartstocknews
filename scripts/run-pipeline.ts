/**
 * 一键运行完整数据管线：采集 → AI处理 → 导出JSON
 * 用法: npx tsx scripts/run-pipeline.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

// ========== 信源配置 ==========
function loadSources() {
  const raw = readFileSync(join(process.cwd(), 'data', 'sources.json'), 'utf-8');
  return JSON.parse(raw);
}

// ========== RSS 采集 ==========
async function fetchRss(source: any): Promise<any[]> {
  const items: any[] = [];
  try {
    const Parser = (await import('rss-parser')).default;
    const parser = new Parser({
      timeout: 15000,
      headers: { 'User-Agent': 'SmartStock/1.0 (RSS Reader)' },
    });
    const feed = await parser.parseURL(source.rssUrl);
    for (const entry of feed.items || []) {
      if (entry.title && entry.link) {
        items.push({
          title: entry.title.trim(),
          url: entry.link.trim(),
          publishedAt: entry.pubDate ? new Date(entry.pubDate) : new Date(),
          contentHtml: entry.contentSnippet || entry.content || '',
        });
      }
    }
  } catch (e: any) {
    console.error(`  [RSS] ${source.name} failed: ${e.message}`);
  }
  return items;
}

function relevanceFilter(items: any[], source: any): any[] {
  const keywords = source.relevanceFilter.split('|').map((k: string) => k.toLowerCase());
  return items.filter((item) => {
    const text = `${item.title} ${item.contentHtml}`.toLowerCase();
    return keywords.some((kw: string) => text.includes(kw));
  });
}

// ========== AI 处理 ==========
async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

function cleanJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return s;
}

async function scoreItem(titleEn: string, content?: string) {
  const prompt = `你是智慧畜牧领域的内容评分专家。请对以下新闻进行五维评分（每项0-100）：

标题: ${titleEn}
${content ? `摘要: ${content.slice(0, 500)}` : ''}

评分维度:
1. relevance: 与智慧畜牧（IoT/AI/自动化/机器人/传感器在养殖业的应用）的相关性
2. importance: 行业影响力和重要程度
3. novelty: 技术新颖性和创新程度
4. readability: 内容可读性和信息密度
5. actionability: 可操作性和实践参考价值

请直接返回JSON（不要markdown包裹）:
{"relevance":数,"importance":数,"novelty":数,"readability":数,"actionability":数}`;

  const raw = await callDeepSeek(prompt);
  return JSON.parse(cleanJson(raw));
}

async function translateItem(titleEn: string, content?: string) {
  const prompt = `将以下英文智慧畜牧新闻翻译为中文。返回JSON格式（不要markdown包裹）：
{"titleZh":"中文标题(简短)","summaryZh":"中文推荐理由(50-100字，说明为什么值得看)"}

英文标题: ${titleEn}
${content ? `英文内容: ${content.slice(0, 800)}` : ''}`;

  const raw = await callDeepSeek(prompt);
  return JSON.parse(cleanJson(raw));
}

function calculateQualityScore(
  scores: any,
  tier: string,
  multiSourceCount: number
): number {
  const tierWeights: Record<string, number> = { T1: 1.0, 'T1.5': 0.7, T2: 0.4 };
  const avg = (scores.relevance + scores.importance + scores.novelty + scores.readability + scores.actionability) / 5;
  const tierWeight = tierWeights[tier] || 0.4;
  const multiBonus = Math.min(multiSourceCount, 3) * 5;
  return Math.round(avg * tierWeight + multiBonus);
}

// ========== 主流程 ==========
async function main() {
  console.log('=== SmartStock 数据管线 ===\n');

  // Step 0: 确保信源在数据库中
  console.log('[1/4] 同步信源...');
  const config = loadSources();
  for (const source of config.sources) {
    await prisma.source.upsert({
      where: { id: source.id },
      update: {},
      create: {
        id: source.id,
        name: source.name,
        nameZh: source.nameZh,
        url: source.url,
        rssUrl: source.rssUrl,
        tier: source.tier,
        species: source.species,
        category: source.category,
      },
    });
  }
  console.log(`  ${config.sources.length} 个信源就绪\n`);

  // Step 1: RSS 采集
  console.log('[2/4] RSS 采集...');
  let totalRaw = 0;
  let totalSaved = 0;
  for (const source of config.sources) {
    const raw = await fetchRss(source);
    totalRaw += raw.length;
    const filtered = relevanceFilter(raw, source);
    // 去重 + 入库
    let saved = 0;
    for (const item of filtered) {
      try {
        await prisma.item.upsert({
          where: { url: item.url },
          update: {},
          create: {
            sourceId: source.id,
            titleEn: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            contentHtml: item.contentHtml,
            species: source.species,
            techTags: '',
            isRelevant: true,
          },
        });
        saved++;
      } catch {}
    }
    totalSaved += saved;
    console.log(`  ${source.name}: ${raw.length} raw → ${filtered.length} filtered → ${saved} saved`);
    await prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
  }
  console.log(`  总计: ${totalRaw} raw → ${totalSaved} saved\n`);

  // Step 2: AI 处理
  console.log('[3/4] AI 处理（评分+翻译）...');
  const pending = await prisma.item.findMany({
    where: { aiScores: null, isRelevant: true },
    include: { source: true },
    take: 50,
  });
  console.log(`  待处理: ${pending.length} 条`);
  let processed = 0;
  for (const item of pending) {
    try {
      const [scores, translation] = await Promise.all([
        scoreItem(item.titleEn, item.contentHtml || undefined),
        translateItem(item.titleEn, item.contentHtml || undefined),
      ]);
      const qualityScore = calculateQualityScore(scores, item.source.tier, item.multiSourceCount);
      await prisma.item.update({
        where: { id: item.id },
        data: {
          aiScores: JSON.stringify(scores),
          titleZh: translation.titleZh,
          summaryZh: translation.summaryZh,
          qualityScore,
          isHot: qualityScore >= 60,
        },
      });
      processed++;
      console.log(`  ✓ [${qualityScore}] ${translation.titleZh || item.titleEn.slice(0, 40)}`);
    } catch (e: any) {
      console.error(`  ✗ ${item.titleEn.slice(0, 40)}: ${e.message}`);
    }
  }
  console.log(`  处理完成: ${processed}/${pending.length}\n`);

  // Step 3: 导出 JSON
  console.log('[4/4] 导出静态 JSON...');
  const outDir = join(process.cwd(), 'public', 'data');
  mkdirSync(outDir, { recursive: true });

  const allItems = await prisma.item.findMany({
    where: { isRelevant: true },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
  });

  const formatItem = (item: any) => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh || '',
    summaryZh: item.summaryZh || '',
    url: item.url,
    source: item.source.nameZh || item.source.name,
    sourceId: item.sourceId,
    species: item.species,
    techTags: item.techTags || '',
    qualityScore: item.qualityScore || 0,
    isFeatured: (item.qualityScore || 0) >= 70,
    isHot: item.isHot,
    publishedAt: item.publishedAt.toISOString(),
  });

  const formatted = allItems.map(formatItem);
  writeFileSync(join(outDir, 'items.json'), JSON.stringify(formatted, null, 2));
  console.log(`  items.json: ${formatted.length} 条`);

  // 热点
  const hot = formatted.filter((i) => i.isHot).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 10);
  writeFileSync(join(outDir, 'hot-items.json'), JSON.stringify(hot, null, 2));

  // 统计
  const stats = {
    sources: config.sources.length,
    items: formatted.length,
    featured: formatted.filter((i) => i.isFeatured).length,
  };
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // 按物种
  for (const sp of ['pig', 'poultry', 'cattle', 'sheep']) {
    const spItems = formatted.filter((i) => i.species.includes(sp));
    writeFileSync(join(outDir, `items-${sp}.json`), JSON.stringify(spItems, null, 2));
    const spHot = spItems.filter((i) => i.isHot).slice(0, 5);
    writeFileSync(join(outDir, `hot-items-${sp}.json`), JSON.stringify(spHot, null, 2));
  }

  console.log(`  stats.json: ${stats.items} items, ${stats.featured} featured`);
  console.log('\n=== 管线完成 ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
