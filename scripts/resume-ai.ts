/**
 * AI 处理恢复脚本
 *
 * 按信息漏斗原则恢复中断的管线：
 *   第二层：关键词预筛（免费）→ 淘汰不相关的
 *   第三层：AI 语义筛选（轻量）→ 淘汰语义不相关的
 *   第四层：AI 评分+翻译+摘要（完整分析）→ 产出精品内容
 *
 * 用法: npx tsx scripts/resume-ai.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BATCH_SIZE = 10; // 并发处理数
const API_DELAY = 500; // 请求间隔 ms

// ========== API 配置 ==========
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
if (!API_KEY) throw new Error('DEEPSEEK_API_KEY 未设置！请检查 .env 文件');

// ========== 智慧农业预筛关键词（与 run-pipeline.ts 保持一致） ==========
const TECH_KEYWORDS = [
  'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'computer vision', 'machine vision', 'image recognition', 'object detection',
  'natural language', 'nlp', 'predictive analytics', 'data analytics',
  'automation', 'automated', 'robot', 'robotic', 'robotics',
  'autonomous', 'unmanned', 'self-driving', 'self-propelled',
  'drone', 'uav', 'uas', 'unmanned aerial',
  'iot', 'internet of things', 'sensor', 'wearable', 'telemetric', 'telemetry',
  'rfid', 'camera system', 'imaging', 'spectral', 'ndvi',
  'precision agriculture', 'precision farming', 'precision livestock',
  'smart farming', 'smart agriculture', 'digital farming', 'digital agriculture',
  'variable rate', 'yield mapping', 'crop monitoring', 'livestock monitoring',
  'gps', 'gnss', 'remote sensing', 'satellite', 'satellite imagery', 'geospatial',
  'data-driven', 'analytics platform', 'cloud platform', 'dashboard',
  'blockchain', 'traceability', 'digital twin',
  'methane', 'biogas', 'carbon credit',
  '人工智能', '机器学习', '深度学习', '神经网络',
  '计算机视觉', '机器视觉', '图像识别', '目标检测',
  '自然语言', '预测分析', '数据分析',
  '自动化', '自动', '机器人', '无人驾驶', '无人', '自主',
  '无人机', '大模型', '算法',
  '物联网', '传感器', '穿戴', '射频', '摄像头', '光谱',
  '精准', '智慧农业', '智慧牧场', '数字农业',
  '变量', '产量图', '作物监测', '畜牧监测',
  '遥感', '卫星',
  '数据驱动', '云平台', '看板', '区块链', '溯源', '数字孪生',
  'AI', 'AI大模型',
];

const AG_KEYWORDS = [
  'farm', 'farming', 'agriculture', 'agricultural', 'agronom', 'crop',
  'greenhouse', 'horticulture', 'nursery', 'garden',
  'irrigation', 'soil', 'field', 'orchard', 'vineyard',
  'harvest', 'yield', 'planting', 'sowing', 'fertigation',
  'controlled environment', 'vertical farm', 'hydroponic', 'aeropon',
  'spraying', 'spray', 'weeding', 'weed control', 'pesticide',
  'rice', 'paddy', 'wheat', 'corn', 'soybean', 'maize', 'cotton',
  'sugarcane', 'potato', 'tomato', 'lettuce', 'grain', 'cereal',
  'seedling', 'acreage', 'hectare', 'protected cultivation',
  'livestock', 'cattle', 'pig', 'poultry', 'sheep', 'goat', 'dairy',
  'feedlot', 'ranch', 'barn', 'stall', 'piggery',
  'broiler', 'layer', 'turkey', 'duck', 'quail',
  'calf', 'heifer', 'bull', 'cow', 'lamb', 'ewe', 'hog', 'sow',
  'chicken', 'hen', 'rooster',
  'precision livestock', 'smart barn', 'smart farm',
  'animal monitoring', 'livestock monitoring', 'herd management',
  'automated feeding', 'automated milking', 'robotic milking',
  'environment control', 'climate control', 'ventilation',
  'feed optimization', 'health monitoring', 'disease detection',
  'behavior analysis', 'weight estimation', 'body condition',
  'breeding', 'phenotyping', 'genomic',
  'aquaculture', 'fish farm', 'shrimp', 'salmon', 'tilapia', 'fisheries',
  '农业', '种植', '作物', '温室', '大棚', '园艺', '灌溉',
  '土壤', '田间', '果园', '采摘', '播种', '施肥',
  '精准农业', '智慧农业', '数字农业', '植物工厂',
  '无土栽培', '水培', '气雾培', '环控',
  '水稻', '小麦', '玉米', '大豆', '棉花', '杂草', '除草', '喷洒',
  '检测', '监测', '探测', '育种', '表型',
  '养殖', '畜牧', '猪', '牛', '羊', '鸡', '禽', '奶牛',
  '牧场', '圈舍', '畜禽', '生猪', '肉牛', '蛋鸡', '肉鸡',
  '精准畜牧', '智能养殖', '智慧牧场',
  '自动饲喂', '自动挤奶', '机器人挤奶',
  '环境控制', '通风', '饲料', '饲喂',
  '健康监测', '疾病检测', '行为分析',
  '水产', '渔业', '鱼', '虾', '养殖池',
  '农机', '农技', '农事', '化肥', '农资', '肥水',
];

const AMBIGUOUS_KWS: Record<string, RegExp[]> = {
  layer: [/supply.chain.{0,15}layer/i, /management.{0,15}layer/i, /organizati.{0,15}layer/i],
  traceability: [/(visit|read|learn|discover|explore).{0,30}traceability/i],
};

function hasCJK(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

function matchKeyword(text: string, kw: string): boolean {
  if (AMBIGUOUS_KWS[kw]) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!regex.test(text)) return false;
    return !AMBIGUOUS_KWS[kw].some((neg) => neg.test(text));
  }
  // 中文关键词：\b 词边界对 CJK 无效，直接用 includes
  if (hasCJK(kw)) return text.includes(kw.toLowerCase());
  if (kw.length <= 5) {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  }
  return text.includes(kw);
}

function preFilter(title: string, content?: string): boolean {
  const text = `${title} ${content || ''}`.toLowerCase();
  const hitTech = TECH_KEYWORDS.some((kw) => matchKeyword(text, kw));
  const hitAg = AG_KEYWORDS.some((kw) => matchKeyword(text, kw));
  if (!hitTech || !hitAg) return false;
  let hits = 0;
  for (const kw of [...TECH_KEYWORDS, ...AG_KEYWORDS]) {
    if (matchKeyword(text, kw)) hits++;
  }
  return hits >= 2;
}

// ========== AI 调用 ==========

async function callDeepSeek(prompt: string, maxTokens = 16000): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
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

/** 检测文本是否含中文 */
function hasChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

/**
 * Stage 1 语义筛选：轻量 AI 判断文章是否与智慧农业相关
 */
async function screeningEvaluate(titleEn: string, content?: string): Promise<boolean> {
  const snippet = content ? content.slice(0, 1500) : '';
  const prompt = `判断这篇新闻是否与智慧农业或智慧畜牧相关。

相关：在养殖业或种植业中应用科技，包括但不限于：
  - 畜牧科技：自动饲喂、机器人挤奶、智能环控、精准畜牧、健康监测、疾病检测、行为分析、育种基因
  - 种植科技：精准农业、自动驾驶、喷洒无人机、除草机器人、温室自动化、植物工厂、水培、灌溉自动化
  - 通用农业科技：IoT、AI、机器学习、计算机视觉、机器人、无人机、传感器、数据分析

不相关：纯市场价格行情、大宗商品交易、食品零售促销、美食/烹饪内容、纯政策法规解读（不含技术）

标题: ${titleEn}
${snippet ? `内容: ${snippet}` : ''}

只返回 JSON：
{"shouldInclude": true} 或 {"shouldInclude": false}`;

  try {
    const raw = await callDeepSeek(prompt, 200);
    const parsed = JSON.parse(cleanJson(raw));
    return parsed.shouldInclude === true;
  } catch (e: any) {
    console.error(`  [筛选] 失败 "${titleEn.slice(0, 40)}": ${e.message}，默认通过`);
    return true;
  }
}

/**
 * Stage 2 完整分析：评分 + 翻译 + 摘要 + 精选理由
 */
async function analyzeItem(titleEn: string, content?: string) {
  const contentSnippet = content ? content.slice(0, 10000) : '';
  const isChinese = hasChinese(contentSnippet || titleEn);
  const fullTranslationSection = isChinese ? '' : `
同时提供中文翻译和推荐理由。全文翻译要求：
- 只翻译文章正文内容，**不要翻译**：标题、日期、作者署名、来源标签、图片说明、byline
- 忠实原文，完整翻译所有段落，段落之间用两个换行符(\\n\\n)分隔
- 小标题保留并加粗：**小标题**`;
  const translationField = isChinese ? '' : `  "translationZh": "全文中文翻译",
`;
  const titleZhField = isChinese ? '' : `  "titleZh": "中文标题(简短准确)",
`;

  const prompt = `你是智慧畜牧行业资深编辑。对以下新闻进行全面分析。

标题: ${titleEn}
${contentSnippet ? `内容: ${contentSnippet}` : ''}

评分维度（每项0-100）:
- relevance: 与智慧畜牧（IoT/AI/自动化/机器人/传感器在养殖业/种植业的应用）的相关性
- importance: 行业影响力和重要程度
- novelty: 技术新颖性和创新程度
- readability: 内容可读性和信息密度
- actionability: 可操作性和实践参考价值

分类（选一个最匹配的 subcategory，除非确实无法归类，否则不要轻易选 general）:
- pig: 猪业
- poultry: 禽业
- cattle: 牛业
- sheep: 羊业
- field: 大田作物
- fruit: 果蔬
- horticulture: 园艺
- general: 综合/跨领域
${fullTranslationSection}
请直接返回JSON（不要markdown包裹）:
{
  "relevance": 数,
  "importance": 数,
  "novelty": 数,
  "readability": 数,
  "actionability": 数,
  "subcategory": "pig|poultry|cattle|sheep|field|fruit|horticulture|general",
${titleZhField}  "summaryZh": "中文摘要(100-150字)",
${translationField}  "featuredReason": "推荐理由(1-2句话)"
}`;

  const raw = await callDeepSeek(prompt);
  return JSON.parse(cleanJson(raw));
}

/**
 * 续翻：翻译被截断时补充剩余部分
 */
async function continueTranslation(
  fullContent: string,
  partialTranslation: string
): Promise<string> {
  const cleanPartial = partialTranslation.replace(/[.……]+$/, '').trim();
  const originalParagraphs = fullContent.split(/\n+/).filter((p: string) => p.trim().length > 20);
  const ratio = Math.min(cleanPartial.length / fullContent.length, 0.95);
  const startIdx = Math.floor(originalParagraphs.length * ratio);
  const remaining = originalParagraphs.slice(startIdx).join('\n\n');
  if (!remaining.trim()) return partialTranslation;

  const prompt = `请将以下英文文章片段翻译成中文。只输出翻译结果。

${remaining.slice(0, 6000)}`;

  const continuation = await callDeepSeek(prompt);
  if (!continuation.trim()) return partialTranslation;
  return cleanPartial + '\n\n' + continuation.trim();
}

// ========== 分类逻辑 ==========

const VALID_SUBCATEGORIES = ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture', 'general'];
const SUBCATEGORY_TO_CATEGORY: Record<string, string> = {
  pig: 'livestock', poultry: 'livestock', cattle: 'livestock', sheep: 'livestock',
  field: 'crop', fruit: 'crop', horticulture: 'crop',
  general: 'aggtech',
};

function classifyItem(item: any, source: any, aiSubcategory?: string) {
  if (aiSubcategory && VALID_SUBCATEGORIES.includes(aiSubcategory)) {
    return { category: SUBCATEGORY_TO_CATEGORY[aiSubcategory], subcategory: aiSubcategory };
  }
  if (source?.category === 'livestock') {
    return { category: 'livestock', subcategory: source.defaultSubcategory || 'cattle' };
  }
  if (source?.category === 'crop') {
    return { category: 'crop', subcategory: source.defaultSubcategory || 'field' };
  }
  const text = `${item.titleEn || ''} ${item.contentHtml || ''} ${item.contentFull || ''}`.toLowerCase();
  if (text.includes('pig') || text.includes('hog') || text.includes('swine') || text.includes('pork'))
    return { category: 'livestock', subcategory: 'pig' };
  if (text.includes('poultry') || text.includes('chicken') || text.includes('broiler') || text.includes('egg'))
    return { category: 'livestock', subcategory: 'poultry' };
  if (text.includes('cattle') || text.includes('beef') || text.includes('dairy') || text.includes('cow'))
    return { category: 'livestock', subcategory: 'cattle' };
  if (text.includes('sheep') || text.includes('lamb') || text.includes('wool'))
    return { category: 'livestock', subcategory: 'sheep' };
  return { category: 'aggtech', subcategory: 'general' };
}

function calculateQualityScore(scores: any, tier: string, multiSourceCount: number): number {
  const tierWeights: Record<string, number> = { T1: 1.0, 'T1.5': 0.7, T2: 0.4 };
  const avg = (scores.relevance + scores.importance + scores.novelty + scores.readability + scores.actionability) / 5;
  const tierWeight = tierWeights[tier] || 0.4;
  const multiBonus = Math.min(multiSourceCount, 3) * 5;
  return Math.round(avg * tierWeight + multiBonus);
}

// ========== 导出 ==========

async function exportData() {
  const { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync } = await import('fs');
  const { join } = await import('path');

  const outDir = join(process.cwd(), 'public', 'data');
  mkdirSync(outDir, { recursive: true });

  const allItems = await prisma.item.findMany({
    where: { isRelevant: true },
    include: { source: true },
    orderBy: { publishedAt: 'desc' },
  });

  const formatItem = (item: any, detail = false) => ({
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh || '',
    url: item.url,
    summaryZh: item.summaryZh || '',
    featuredReason: item.featuredReason || '',
    source: { name: item.source?.name || '', nameZh: item.source?.nameZh || '', tier: item.source?.tier || 'T2' },
    species: item.species || 'general',
    category: item.category || 'aggtech',
    subcategory: item.subcategory || 'general',
    techTags: item.techTags || '',
    qualityScore: item.qualityScore || 0,
    isFeatured: (() => {
      const tier = item.source?.tier || 'T2';
      const qs = item.qualityScore || 0;
      if (tier === 'T1') return qs >= 60;
      if (tier === 'T1.5') return qs >= 70;
      return qs >= 80;
    })(),
    isHot: item.isHot || false,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : '',
    ...(detail ? {
      contentFull: item.contentFull || '',
      translationZh: item.translationZh || '',
      images: item.images ? (() => { try { return JSON.parse(item.images); } catch { return []; } })() : [],
      author: item.author || '',
      contentHtml: item.contentHtml?.replace?.(/<script[\s\S]*?<\/script>/gi, '')?.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '') || '',
      scrapeMethod: item.scrapeMethod || 'rss',
    } : {}),
  });

  const formatted = allItems.map(i => formatItem(i, false));

  // items.json
  writeFileSync(join(outDir, 'items.json'), JSON.stringify(formatted, null, 2));

  // item-ids.json
  writeFileSync(join(outDir, 'item-ids.json'), JSON.stringify(formatted.map(i => i.id)));

  // detail files
  const detailDir = join(outDir, 'items');
  mkdirSync(detailDir, { recursive: true });
  // 清理孤立文件
  const validIds = new Set(formatted.map(i => i.id));
  const existingFiles = readdirSync(detailDir).filter(f => f.endsWith('.json'));
  for (const file of existingFiles) {
    const id = file.replace('.json', '');
    if (!validIds.has(id)) unlinkSync(join(detailDir, file));
  }
  // 写新文件
  for (const item of allItems) {
    writeFileSync(join(detailDir, `${item.id}.json`), JSON.stringify(formatItem(item, true), null, 2));
  }

  // hot-items
  const hot = formatted.filter(i => i.isHot).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 5);
  writeFileSync(join(outDir, 'hot-items.json'), JSON.stringify(hot, null, 2));

  // 按分类
  const categories = ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture', 'general'];
  for (const sp of categories) {
    const spItems = sp === 'general'
      ? formatted.filter(i => i.subcategory === 'general')
      : formatted.filter(i => i.subcategory === sp || i.species?.includes(sp));
    writeFileSync(join(outDir, `items-${sp}.json`), JSON.stringify(spItems, null, 2));
    writeFileSync(join(outDir, `hot-items-${sp}.json`), JSON.stringify(spItems.filter(i => i.isHot).slice(0, 5), null, 2));
  }

  // stats
  const sourceCount = new Set(formatted.map((i: any) => i.source?.name)).size;
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify({
    sources: sourceCount,
    items: formatted.length,
    featured: formatted.filter(i => i.isFeatured).length,
    hot: hot.length,
    lastUpdated: new Date().toISOString(),
  }, null, 2));

  console.log(`\n📤 导出完成: ${formatted.length} 条 (featured: ${formatted.filter(i => i.isFeatured).length}, hot: ${hot.length})`);
}

// ========== 主流程 ==========

async function main() {
  console.log('=== AI 处理恢复管线 ===\n');

  const startTime = Date.now();
  const config = JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), 'data', 'sources.json'), 'utf-8'));
  const sourceMap = Object.fromEntries(config.sources.map((s: any) => [s.id, s]));

  // 获取待处理 item：有 content 的优先处理
  const pending = await prisma.item.findMany({
    where: { isRelevant: true, aiScores: null },
    include: { source: true },
    orderBy: [
      { contentFull: 'desc' }, // 有全文的优先
      { contentHtml: 'desc' }, // 有 RSS 摘要的其次
    ],
  });

  console.log(`📊 待处理 item: ${pending.length} 条`);

  // 🛡️ 内容完整性守卫：contentFull/contentHtml 都不足 100 字的跳过 AI
  // 避免产品页/只有标题的条目浪费 token，标记待补爬
  const MIN_CONTENT = 100;
  const needsScrape = pending.filter(item => {
    const c = item.contentFull || item.contentHtml || '';
    return c.length < MIN_CONTENT;
  });
  for (const item of needsScrape) {
    await prisma.item.update({
      where: { id: item.id },
      data: {
        techTags: item.techTags ? `${item.techTags},needs_full_scrape` : 'needs_full_scrape',
        ...(item.scrapedAt ? { scrapedAt: null, scrapeMethod: null } : {}),
      },
    });
  }
  const aiReady = pending.filter(item => {
    const c = item.contentFull || item.contentHtml || '';
    return c.length >= MIN_CONTENT;
  });
  if (needsScrape.length > 0) {
    console.log(`  ⏭ 内容不足跳过 AI（标记 needs_full_scrape）: ${needsScrape.length} 条`);
  }
  console.log(`  → 实际进入 AI: ${aiReady.length} 条\n`);

  let preFiltered = 0;
  let aiRejected = 0;
  let processed = 0;
  let failed = 0;

  // 分批处理
  for (let i = 0; i < aiReady.length; i += BATCH_SIZE) {
    const batch = aiReady.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        const contentText = `${item.contentFull || ''} ${item.contentHtml || ''}`.trim();

        // ===== 第二层：关键词预筛 =====
        if (!preFilter(item.titleEn, contentText || item.titleEn)) {
          await prisma.item.update({
            where: { id: item.id },
            data: { isRelevant: false, techTags: 'pre_filter_rejected' },
          });
          preFiltered++;
          console.log(`  🔍 [预筛淘汰] ${item.titleEn.slice(0, 45)}`);
          return;
        }

        // 组合 AI 用的内容
        const contentForAI = item.contentFull || item.contentHtml || item.titleEn;
        const isChineseContent = hasChinese(contentForAI);

        // ===== 第三层：AI 语义筛选 =====
        const shouldInclude = await screeningEvaluate(item.titleEn, contentForAI);
        if (!shouldInclude) {
          await prisma.item.update({
            where: { id: item.id },
            data: { isRelevant: false, techTags: 'ai_rejected' },
          });
          aiRejected++;
          console.log(`  🤖 [AI淘汰] ${item.titleEn.slice(0, 45)}`);
          return;
        }

        // ===== 第四层：完整分析 =====
        const result = await analyzeItem(item.titleEn, contentForAI);

        // 续翻处理
        let translation = result.translationZh || '';
        if (!isChineseContent && item.contentFull && translation && (translation.endsWith('……') || translation.endsWith('......'))) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              translation = await continueTranslation(item.contentFull, translation);
              if (!translation.endsWith('……') && !translation.endsWith('......')) break;
            } catch { break; }
          }
        }

        const titleZh = result.titleZh || (isChineseContent ? item.titleEn : '');
        const scores = {
          relevance: result.relevance, importance: result.importance,
          novelty: result.novelty, readability: result.readability, actionability: result.actionability,
        };
        const qualityScore = calculateQualityScore(scores, item.source?.tier || 'T2', item.multiSourceCount);
        const { category, subcategory } = classifyItem(item, item.source, result.subcategory);
        const species = subcategory || item.species;

        await prisma.item.update({
          where: { id: item.id },
          data: {
            aiScores: JSON.stringify(scores),
            titleZh,
            summaryZh: result.summaryZh,
            translationZh: translation,
            featuredReason: result.featuredReason,
            qualityScore,
            isHot: qualityScore >= 75 || item.multiSourceCount >= 3,
            category,
            subcategory,
            species,
          },
        });

        processed++;
        console.log(`  ⭐ [${qualityScore}] ${(titleZh || item.titleEn).slice(0, 40)}`);
      })
    );

    // 统计失败数
    for (const r of batchResults) {
      if (r.status === 'rejected') {
        failed++;
        console.error(`  ✗ 处理失败: ${r.reason?.message?.slice(0, 100)}`);
      }
    }

    // 进度
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n  批次 ${i / BATCH_SIZE + 1}/${Math.ceil(pending.length / BATCH_SIZE)} | ${elapsed}s | 已处理: ${processed} | 预筛淘汰: ${preFiltered} | AI淘汰: ${aiRejected} | 失败: ${failed}\n`);

    // 批次间延迟，避免 API 限流
    await new Promise(r => setTimeout(r, API_DELAY));
  }

  // ===== 修复 species 字段 =====
  const speciesMap: Record<string, string> = {
    pig: 'pig', poultry: 'poultry', cattle: 'cattle', sheep: 'sheep',
    field: 'field', fruit: 'fruit', horticulture: 'horticulture',
  };
  const needsFix = await prisma.item.findMany({
    where: { isRelevant: true, subcategory: { in: Object.keys(speciesMap) }, NOT: { aiScores: null } },
  });
  let fixedCount = 0;
  for (const item of needsFix) {
    const correct = speciesMap[item.subcategory!];
    if (item.species !== correct) {
      await prisma.item.update({ where: { id: item.id }, data: { species: correct } });
      fixedCount++;
    }
  }

  // ===== 导出 =====
  console.log('\n=== 导出静态数据 ===');
  await exportData();

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== 完成 (${totalElapsed}s) ===`);
  console.log(`处理: ${processed} | 预筛淘汰: ${preFiltered} | AI淘汰: ${aiRejected} | 失败: ${failed} | species修复: ${fixedCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect().catch(() => {}));
