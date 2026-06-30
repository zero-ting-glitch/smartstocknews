/**
 * 一键运行完整数据管线：采集 → 全文爬取 → AI处理 → 导出JSON
 * 用法: npx tsx scripts/run-pipeline.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';
import { scrapeArticle, scrapeListingPage } from '../src/lib/collector/scraper';

const prisma = new PrismaClient();
const CONCURRENCY = 5;
const DELAY_MS = 100;

// ========== 信源配置 ==========
function loadSources() {
  const raw = readFileSync(join(process.cwd(), 'data', 'sources.json'), 'utf-8');
  return JSON.parse(raw);
}

// ========== RSS 采集 ==========
async function fetchRss(source: any): Promise<any[]> {
  const items: any[] = [];
  if (!source.rssUrl) return items;
  try {
    const rssParser = await import('rss-parser') as any;
    const Parser = rssParser.default || rssParser;
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
  const coreKeywords = (source.coreKeywords || '').split('|').map((k: string) => k.trim().toLowerCase());
  const excludeKeywords = (source.excludeKeywords || '').split('|').map((k: string) => k.trim().toLowerCase());

  return items.filter((item) => {
    const text = `${item.title} ${item.contentHtml}`.toLowerCase();
    const hitCore = coreKeywords.some((kw: string) => kw && text.includes(kw));
    if (!hitCore) return false;
    const hitExclude = excludeKeywords.some((kw: string) => kw && text.includes(kw));
    if (hitExclude) return false;
    return true;
  });
}

// ========== 智慧农业预筛（AI 处理前快速过滤） ==========
// 核心逻辑：必须同时命中「技术词」和「农业词」才算相关
// 防止智慧城市/医疗/零售等非农业技术文章混入

const TECH_KEYWORDS = [
  // English
  'iot', 'ai ', 'ai-', 'artificial intelligence', 'machine learning', 'deep learning',
  'automation', 'automated', 'robot', 'robotic', 'drone', 'uav',
  'sensor', 'wearable', 'telemetric', 'gps', 'remote sensing',
  'computer vision', 'image recognition', 'nlp',
  'blockchain', 'data analytics', 'predictive',
  // 中文
  '人工智能', '机器学习', '深度学习', '物联网', '传感器', '无人机',
  '机器人', '自动化', '遥感', '卫星', '计算机视觉', '图像识别',
  '大数据', '算法', '数字化', '区块链', '视觉识别', '自然语言',
];

const AG_KEYWORDS = [
  // English - 种植业
  'farm', 'farming', 'agriculture', 'crop', 'greenhouse', 'horticulture',
  'irrigation', 'soil', 'field', 'orchard', 'vineyard',
  'harvest', 'yield', 'planting', 'sowing', 'fertigation',
  'precision farming', 'precision agriculture', 'smart farm',
  'digital agriculture', 'digital farming',
  'controlled environment', 'vertical farm', 'hydroponic',
  'variable rate', 'yield mapping', 'crop monitoring',
  'satellite imagery', 'ndvi', 'spectral',
  // English - 养殖业
  'livestock', 'cattle', 'pig', 'poultry', 'sheep', 'dairy',
  'feedlot', 'ranch', 'barn', 'stall',
  'precision livestock', 'smart barn',
  'animal monitoring', 'livestock monitoring', 'herd management',
  'automated feeding', 'automated milking', 'robotic milking',
  'environment control', 'climate control', 'ventilation control',
  'feed optimization', 'health monitoring', 'disease detection',
  'behavior analysis', 'weight estimation', 'body condition',
  // 中文 - 种植业
  '农业', '种植', '作物', '温室', '大棚', '园艺', '灌溉',
  '土壤', '田间', '果园', '采摘', '播种', '施肥',
  '精准农业', '智慧农业', '数字农业', '植物工厂',
  '无土栽培', '水培', '气雾培', '环控',
  // 中文 - 养殖业
  '养殖', '畜牧', '猪', '牛', '羊', '鸡', '禽', '奶牛',
  '牧场', '圈舍', '畜禽',
  '精准畜牧', '智能养殖', '智慧牧场',
  '自动饲喂', '自动挤奶', '机器人挤奶',
  '环境控制', '通风控制', '饲料优化',
  '健康监测', '疾病检测', '行为分析',
];

function smartAgScore(text: string): number {
  const lower = text.toLowerCase();
  const hitTech = TECH_KEYWORDS.some((kw) => lower.includes(kw));
  const hitAg = AG_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hitTech || !hitAg) return 0;
  let hits = 0;
  for (const kw of [...TECH_KEYWORDS, ...AG_KEYWORDS]) {
    if (lower.includes(kw)) hits++;
  }
  return hits;
}

const SMART_AG_THRESHOLD = 3; // 技术+农业各至少1个，总命中至少3个

function preFilterItems(items: any[]): { accepted: any[]; rejected: any[] } {
  const accepted: any[] = [];
  const rejected: any[] = [];
  for (const item of items) {
    const text = `${item.titleEn || ''} ${item.contentFull || ''} ${item.contentHtml || ''}`;
    const score = smartAgScore(text);
    if (score >= SMART_AG_THRESHOLD) {
      accepted.push(item);
    } else {
      rejected.push(item);
    }
  }
  return { accepted, rejected };
}

// ========== 全文爬取 ==========
async function scrapeArticlesBatch(items: any[]): Promise<{ scraped: number; failed: number }> {
  const toScrape = items.filter((item) => !item.scrapedAt);
  if (toScrape.length === 0) {
    console.log(`  所有 ${items.length} 条已爬取过，跳过`);
    return { scraped: 0, failed: 0 };
  }

  console.log(`  需爬取: ${toScrape.length} 条`);
  let scraped = 0;
  let failed = 0;

  for (let i = 0; i < toScrape.length; i += CONCURRENCY) {
    const batch = toScrape.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((item) => scrapeArticle(item.url, item.source?.scrapeConfig))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const item = batch[j];
      if (result.status === 'fulfilled' && result.value) {
        const { contentText, images, author } = result.value;
        await prisma.item.update({
          where: { id: item.id },
          data: {
            contentFull: contentText,
            images: JSON.stringify(images),
            author,
            scrapedAt: new Date(),
            scrapeMethod: 'web_scrape',
          },
        });
        scraped++;
      } else {
        // 爬取失败：标记 scrapedAt 防止无限重试
        failed++;
        await prisma.item.update({
          where: { id: item.id },
          data: {
            scrapedAt: new Date(),
            scrapeMethod: 'scrape_failed',
          },
        });
      }
    }

    if (i + CONCURRENCY < toScrape.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`  爬取完成: ${scraped} 成功, ${failed} 失败`);
  return { scraped, failed };
}

// ========== AI 处理（统一提示词） ==========
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
      max_tokens: 1500,
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

async function analyzeItem(titleEn: string, content?: string) {
  const contentSnippet = content ? content.slice(0, 2000) : '';
  const prompt = `你是智慧畜牧行业资深编辑。对以下新闻进行全面分析。

标题: ${titleEn}
${contentSnippet ? `内容: ${contentSnippet}` : ''}

评分维度（每项0-100）:
- relevance: 与智慧畜牧（IoT/AI/自动化/机器人/传感器在养殖业/种植业的应用）的相关性
- importance: 行业影响力和重要程度
- novelty: 技术新颖性和创新程度
- readability: 内容可读性和信息密度
- actionability: 可操作性和实践参考价值

同时提供中文翻译和推荐理由。

请直接返回JSON（不要markdown包裹）:
{
  "relevance": 数,
  "importance": 数,
  "novelty": 数,
  "readability": 数,
  "actionability": 数,
  "titleZh": "中文标题(简短准确)",
  "summaryZh": "中文摘要(100-150字，说明核心内容和价值)",
  "featuredReason": "推荐理由(1-2句话，说明为什么值得智慧畜牧行业人士阅读)"
}`;

  const raw = await callDeepSeek(prompt);
  try {
    return JSON.parse(cleanJson(raw));
  } catch (e) {
    console.error(`  [AI] JSON 解析失败: ${raw.slice(0, 200)}`);
    throw e;
  }
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

function classifyItem(item: any, source: any): { category: string; subcategory: string } {
  // source.species 存的是类别（"livestock"/"crop"/"aggtech"），由管线写入
  if (source.species === 'livestock') {
    return { category: 'livestock', subcategory: source.defaultSubcategory || 'cattle' };
  }
  if (source.species === 'crop') {
    return { category: 'crop', subcategory: source.defaultSubcategory || 'field' };
  }

  const text = `${item.title} ${item.contentHtml || ''} ${item.contentFull || ''}`.toLowerCase();

  if (text.includes('pig') || text.includes('hog') || text.includes('swine') || text.includes('pork')) {
    return { category: 'livestock', subcategory: 'pig' };
  }
  if (text.includes('poultry') || text.includes('chicken') || text.includes('broiler') || text.includes('egg')) {
    return { category: 'livestock', subcategory: 'poultry' };
  }
  if (text.includes('cattle') || text.includes('beef') || text.includes('dairy') || text.includes('cow')) {
    return { category: 'livestock', subcategory: 'cattle' };
  }
  if (text.includes('sheep') || text.includes('lamb') || text.includes('wool')) {
    return { category: 'livestock', subcategory: 'sheep' };
  }
  if (text.includes('corn') || text.includes('wheat') || text.includes('soybean') || text.includes('rice') || text.includes('grain')) {
    return { category: 'crop', subcategory: 'field' };
  }
  if (text.includes('fruit') || text.includes('vegetable') || text.includes('harvest') || text.includes('orchard')) {
    return { category: 'crop', subcategory: 'fruit' };
  }
  if (text.includes('greenhouse') || text.includes('nursery') || text.includes('floriculture') || text.includes('horticulture')) {
    return { category: 'crop', subcategory: 'horticulture' };
  }

  return { category: 'aggtech', subcategory: 'general' };
}

// ========== 主流程 ==========
async function main() {
  console.log('=== SmartStock 数据管线 v2 ===\n');
  const startTime = Date.now();

  // Step 1: 同步信源
  console.log('[1/5] 同步信源...');
  const config = loadSources();
  for (const source of config.sources) {
    await prisma.source.upsert({
      where: { id: source.id },
      update: {
        species: source.type || 'aggtech',
        category: source.defaultCategory || 'aggtech',
        defaultSubcategory: source.defaultSubcategory || 'general',
      },
      create: {
        id: source.id,
        name: source.name,
        nameZh: source.nameZh,
        url: source.url,
        rssUrl: source.rssUrl,
        tier: source.tier,
        species: source.type || 'aggtech',
        category: source.defaultCategory || 'aggtech',
        defaultSubcategory: source.defaultSubcategory || 'general',
      },
    });
  }
  console.log(`  ${config.sources.length} 个信源就绪\n`);

  // Step 2: 采集 URL（RSS + 列表页）
  console.log('[2/5] 采集 URL...');
  let totalRaw = 0;
  let totalSaved = 0;
  for (const source of config.sources) {
    let raw: any[] = [];

    // RSS 采集
    if (source.rssUrl) {
      raw = await fetchRss(source);
    }

    // 列表页爬取
    if (source.scrapeType === 'listing_page' && source.listUrl && source.scrapeConfig) {
      const listings = await scrapeListingPage(source.listUrl, source.scrapeConfig);
      for (const listing of listings) {
        raw.push({
          title: listing.title,
          url: listing.url,
          publishedAt: listing.publishedAt || new Date(),
          contentHtml: '',
        });
      }
    }

    totalRaw += raw.length;
    const filtered = relevanceFilter(raw, source);
    let saved = 0;
    for (const item of filtered) {
      try {
        await prisma.item.upsert({
          where: { url: item.url },
          update: {
            // 补充 RSS snippet（首次采集时可能为空）
            ...(item.contentHtml ? { contentHtml: item.contentHtml } : {}),
          },
          create: {
            sourceId: source.id,
            titleEn: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            contentHtml: item.contentHtml,
            species: source.type || source.defaultCategory || 'aggtech',
            techTags: '',
            isRelevant: true,
          },
        });
        saved++;
      } catch (e: any) {
        // URL 重复或其他 DB 错误，静默跳过
      }
    }
    totalSaved += saved;
    console.log(`  ${source.name}: ${raw.length} raw → ${filtered.length} filtered → ${saved} saved`);
    await prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
  }
  console.log(`  总计: ${totalRaw} raw → ${totalSaved} saved\n`);

  // Step 3: 全文爬取
  console.log('[3/5] 全文爬取...');
  const unscraped = await prisma.item.findMany({
    where: { scrapedAt: null, isRelevant: true },
    include: { source: true },
  });
  const { scraped: scrapedCount, failed: failedCount } = await scrapeArticlesBatch(unscraped);
  console.log(`  全文爬取完成: ${scrapedCount} 成功, ${failedCount} 失败\n`);

  // Step 4: AI 处理（统一提示词，循环处理所有待处理 item）
  console.log('[4/5] AI 处理（统一分析）...');
  const pending = await prisma.item.findMany({
    where: { OR: [{ aiScores: null }, { category: null }], isRelevant: true },
    include: { source: true },
  });
  console.log(`  待处理: ${pending.length} 条`);

  // 预筛：跳过明显与智慧畜牧无关的 item
  const { accepted, rejected } = preFilterItems(pending);
  if (rejected.length > 0) {
    console.log(`  预筛跳过 ${rejected.length} 条（智慧畜牧关键词不足 ${SMART_AG_THRESHOLD} 个）`);
    for (const item of rejected) {
      console.log(`    ✗ ${item.titleEn?.slice(0, 80)}`);
      await prisma.item.update({
        where: { id: item.id },
        data: {
          isRelevant: false,
          techTags: 'pre_filter_rejected',
        },
      });
    }
  }
  console.log(`  预筛通过: ${accepted.length} 条\n`);

  let processed = 0;
  for (const item of accepted) {
    try {
      const contentForAI = item.contentFull || item.contentHtml || '';
      const result = await analyzeItem(item.titleEn, contentForAI);

      const scores = {
        relevance: result.relevance,
        importance: result.importance,
        novelty: result.novelty,
        readability: result.readability,
        actionability: result.actionability,
      };
      const qualityScore = calculateQualityScore(scores, item.source.tier, item.multiSourceCount);
      const { category, subcategory } = classifyItem(item, item.source);
      const species = category === 'crop' ? subcategory : item.species;

      await prisma.item.update({
        where: { id: item.id },
        data: {
          aiScores: JSON.stringify(scores),
          titleZh: result.titleZh,
          summaryZh: result.summaryZh,
          featuredReason: result.featuredReason,
          qualityScore,
          isHot: qualityScore >= 60,
          category,
          subcategory,
          species,
        },
      });
      processed++;
      console.log(`  ✓ [${qualityScore}] ${result.titleZh || item.titleEn.slice(0, 40)}`);
    } catch (e: any) {
      console.error(`  ✗ ${item.titleEn.slice(0, 40)}: ${e.message}`);
    }
  }
  console.log(`  处理完成: ${processed}/${pending.length}\n`);

  // Step 5: 导出 JSON
  console.log('[5/5] 导出静态 JSON...');
  const outDir = join(process.cwd(), 'public', 'data');
  mkdirSync(outDir, { recursive: true });

  const allItems = await prisma.item.findMany({
    where: { isRelevant: true },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
  });

  // 列表格式（不含全文，保持轻量）
  const formatListItem = (item: any) => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh || '',
    summaryZh: item.summaryZh || '',
    featuredReason: item.featuredReason || '',
    url: item.url,
    source: { name: item.source.name, nameZh: item.source.nameZh, tier: item.source.tier },
    sourceId: item.sourceId,
    species: item.species,
    category: item.category || 'aggtech',
    subcategory: item.subcategory || 'general',
    techTags: item.techTags || '',
    qualityScore: item.qualityScore || 0,
    isFeatured: (item.qualityScore || 0) >= 55,
    isHot: item.isHot,
    publishedAt: item.publishedAt.toISOString(),
  });

  // 详情格式（含全文、图片等）
  // contentHtml 在导出前净化：移除 script/style 标签和事件属性，防止存储型 XSS
  const sanitizeHtml = (html: string): string =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '');

  const formatDetailItem = (item: any) => ({
    ...formatListItem(item),
    contentFull: item.contentFull || '',
    images: item.images ? (() => { try { return JSON.parse(item.images); } catch { return []; } })() : [],
    author: item.author || '',
    contentHtml: item.contentHtml ? sanitizeHtml(item.contentHtml) : '',
    scrapeMethod: item.scrapeMethod || 'rss',
  });

  const formatted = allItems.map(formatListItem);

  // 列表 JSON
  writeFileSync(join(outDir, 'items.json'), JSON.stringify(formatted, null, 2));
  console.log(`  items.json: ${formatted.length} 条`);

  // Item IDs 列表（供 generateStaticParams 使用）
  const itemIds = allItems.map((item) => item.id);
  writeFileSync(join(outDir, 'item-ids.json'), JSON.stringify(itemIds));

  // 详情 JSON（每条一个文件）
  const detailDir = join(outDir, 'items');
  mkdirSync(detailDir, { recursive: true });
  for (const item of allItems) {
    const detail = formatDetailItem(item);
    writeFileSync(join(detailDir, `${item.id}.json`), JSON.stringify(detail, null, 2));
  }
  console.log(`  items/*.json: ${allItems.length} 个详情文件`);

  // 热点
  const hot = formatted.filter((i) => i.isHot).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 10);
  writeFileSync(join(outDir, 'hot-items.json'), JSON.stringify(hot, null, 2));

  // 统计
  const stats = {
    sources: config.sources.length,
    items: formatted.length,
    featured: formatted.filter((i) => i.isFeatured).length,
    lastUpdated: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // 按物种（含种植业）
  for (const sp of ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture']) {
    const spItems = formatted.filter((i) => i.species.includes(sp) || i.subcategory === sp);
    writeFileSync(join(outDir, `items-${sp}.json`), JSON.stringify(spItems, null, 2));
    const spHot = spItems.filter((i) => i.isHot).slice(0, 5);
    writeFileSync(join(outDir, `hot-items-${sp}.json`), JSON.stringify(spHot, null, 2));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`  stats.json: ${stats.items} items, ${stats.featured} featured`);
  console.log(`\n=== 管线完成 (${elapsed}s) ===`);
}

main()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect().catch(() => {});
    // 防止 prisma disconnect 卡住导致进程不退出
    setTimeout(() => process.exit(0), 5000);
  });
