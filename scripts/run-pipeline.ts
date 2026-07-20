/**
 * 一键运行完整数据管线：采集 → 全文爬取 → AI处理 → 导出JSON
 * 用法: npx tsx scripts/run-pipeline.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';
import { scrapeArticle, scrapeListingPage, fetchWithBrowserRss, closeBrowser } from '../src/lib/collector/scraper';

const prisma = new PrismaClient();
const CONCURRENCY = 5;
const DELAY_MS = 100;
const DOMAIN_DELAY_MS = 2000; // 同域名请求间隔，防 429

// ========== 信源配置 ==========
function loadSources() {
  const raw = readFileSync(join(process.cwd(), 'data', 'sources.json'), 'utf-8');
  return JSON.parse(raw);
}

// ========== RSS 采集 ==========

/** 清理不规范的 XML：将 HTML 实体转为 Unicode 字符，修复裸 & */
function sanitizeXml(xml: string): string {
  // 常见 HTML 实体 → Unicode 字符
  const htmlEntities: Record<string, string> = {
    '&mdash;': '—', '&ndash;': '–', '&nbsp;': ' ', '&hellip;': '…',
    '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”',
    '&bull;': '•', '&middot;': '·', '&copy;': '©', '&reg;': '®',
    '&trade;': '™', '&euro;': '€', '&pound;': '£', '&yen;': '¥',
    '&deg;': '°', '&micro;': 'µ', '&para;': '¶', '&sect;': '§',
  };
  let result = xml;
  for (const [entity, char] of Object.entries(htmlEntities)) {
    result = result.replaceAll(entity, char);
  }
  // 剩余未识别的 HTML 实体（&xxx; 格式）直接移除
  result = result.replace(/&[a-zA-Z]+;/g, (match) => {
    if (['&amp;', '&lt;', '&gt;', '&apos;', '&quot;'].includes(match)) return match;
    return '';
  });
  // 修复裸 & 字符
  result = result.replace(/&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
  return result;
}

async function fetchRss(source: any): Promise<any[]> {
  const items: any[] = [];
  if (!source.rssUrl) return items;
  try {
    const rssParser = await import('rss-parser') as any;
    const Parser = rssParser.default || rssParser;
    const parser = new Parser({
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
    });
    const feed = await parser.parseURL(source.rssUrl);
    for (const entry of feed.items || []) {
      if (entry.title && entry.link) {
        items.push({
          title: entry.title.trim(),
          url: entry.link.trim(),
          publishedAt: entry.pubDate ? new Date(entry.pubDate) : null,
          contentHtml: entry.contentSnippet || entry.content || '',
        });
      }
    }
  } catch (e: any) {
    // RSS 解析失败（可能 403），尝试浏览器回退
    console.log(`  [RSS] ${source.name} 解析失败，尝试浏览器回退: ${e.message}`);
    try {
      const rawXml = await fetchWithBrowserRss(source.rssUrl);
      if (rawXml) {
        const rssParser = await import('rss-parser') as any;
        const Parser = rssParser.default || rssParser;
        const parser = new Parser();
        const feed = await parser.parseString(sanitizeXml(rawXml));
        for (const entry of feed.items || []) {
          if (entry.title && entry.link) {
            items.push({
              title: entry.title.trim(),
              url: entry.link.trim(),
              publishedAt: entry.pubDate ? new Date(entry.pubDate) : null,
              contentHtml: entry.contentSnippet || entry.content || '',
            });
          }
        }
        console.log(`  [RSS] ${source.name} 浏览器回退成功: ${items.length} 条`);
      }
    } catch (e2: any) {
      console.error(`  [RSS] ${source.name} 浏览器回退也失败: ${e2.message}`);
    }
  }
  return items;
}

// ========== 标题去重 ==========
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

function isDuplicate(title: string, seenTitles: string[]): boolean {
  const norm = normalizeTitle(title);
  for (const seen of seenTitles) {
    if (titleSimilarity(norm, seen) >= 0.6) return true;
  }
  return false;
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

// ========== 智慧农业预筛（全文爬取后快速过滤） ==========
// 核心逻辑：必须同时命中「技术词」和「农业词」才算相关
// 防止智慧城市/医疗/零售等非农业技术文章混入
// 运行时机：Step 3 全文爬取之后，Step 4 AI 处理之前（用全文内容判断）

const TECH_KEYWORDS = [
  // AI/ML
  'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'computer vision', 'machine vision', 'image recognition', 'object detection',
  'natural language', 'nlp', 'predictive analytics', 'data analytics',
  // 自动化/机器人
  'automation', 'automated', 'robot', 'robotic', 'robotics',
  'autonomous', 'unmanned', 'self-driving', 'self-propelled',
  // 无人机
  'drone', 'uav', 'uas', 'unmanned aerial',
  // IoT/传感器
  'iot', 'internet of things', 'sensor', 'wearable', 'telemetric', 'telemetry',
  'rfid', 'camera system', 'imaging', 'spectral', 'ndvi',
  // 精准/数字（复合词，不加单独 "precision" 以避免 "precision of measurement" 等误匹配）
  'precision agriculture', 'precision farming', 'precision livestock',
  'smart farming', 'smart agriculture', 'digital farming', 'digital agriculture',
  'variable rate', 'yield mapping', 'crop monitoring', 'livestock monitoring',
  'gps', 'gnss', 'remote sensing', 'satellite', 'satellite imagery', 'geospatial',
  // 数据/平台
  'data-driven', 'analytics platform', 'cloud platform', 'dashboard',
  'blockchain', 'traceability', 'digital twin',
  // 环境/能源监测
  'methane', 'biogas', 'carbon credit',
  // 中文
  '人工智能', '机器学习', '深度学习', '神经网络',
  '计算机视觉', '机器视觉', '图像识别', '目标检测',
  '自然语言', '预测分析', '数据分析',
  '自动化', '自动', '机器人', '无人驾驶', '无人', '自主',
  '无人机',
  '物联网', '传感器', '穿戴', '射频', '摄像头', '光谱',
  '精准', '智慧农业', '智慧牧场', '数字农业',
  '变量', '产量图', '作物监测', '畜牧监测',
  '遥感', '卫星',
  '数据驱动', '云平台', '看板', '区块链', '溯源', '数字孪生',
];

const AG_KEYWORDS = [
  // 种植业 - 通用
  'farm', 'farming', 'agriculture', 'agricultural', 'agronom', 'crop',
  'greenhouse', 'horticulture', 'nursery', 'garden',
  'irrigation', 'soil', 'field', 'orchard', 'vineyard',
  'harvest', 'yield', 'planting', 'sowing', 'fertigation',
  'controlled environment', 'vertical farm', 'hydroponic', 'aeropon',
  'spraying', 'spray', 'weeding', 'weed control', 'pesticide',
  // 大田作物
  'rice', 'paddy', 'wheat', 'corn', 'soybean', 'maize', 'cotton',
  'sugarcane', 'potato', 'tomato', 'lettuce', 'grain', 'cereal',
  // 种植管理
  'seedling', 'nursery', 'acreage', 'hectare', 'protected cultivation',
  // 养殖业 - 通用
  'livestock', 'cattle', 'pig', 'poultry', 'sheep', 'goat', 'dairy',
  'feedlot', 'ranch', 'barn', 'stall', 'piggery',
  'broiler', 'layer', 'turkey', 'duck', 'quail',
  'calf', 'heifer', 'bull', 'cow', 'lamb', 'ewe', 'hog', 'sow',
  'chicken', 'hen', 'rooster',
  // 养殖业 - 技术场景
  'precision livestock', 'smart barn', 'smart farm',
  'animal monitoring', 'livestock monitoring', 'herd management',
  'automated feeding', 'automated milking', 'robotic milking',
  'environment control', 'climate control', 'ventilation',
  'feed optimization', 'health monitoring', 'disease detection',
  'behavior analysis', 'weight estimation', 'body condition',
  'breeding', 'phenotyping', 'genomic',
  // 水产
  'aquaculture', 'fish farm', 'shrimp', 'salmon', 'tilapia', 'fisheries',
  // 昆虫/其他
  'insect farm', 'apiculture', 'beekeeping',
  // 中文 - 种植业
  '农业', '种植', '作物', '温室', '大棚', '园艺', '灌溉',
  '土壤', '田间', '果园', '采摘', '播种', '施肥',
  '精准农业', '智慧农业', '数字农业', '植物工厂',
  '无土栽培', '水培', '气雾培', '环控',
  '水稻', '小麦', '玉米', '大豆', '棉花', '杂草', '除草', '喷洒',
  '检测', '监测', '探测', '育种', '表型',
  // 中文 - 养殖业
  '养殖', '畜牧', '猪', '牛', '羊', '鸡', '禽', '奶牛',
  '牧场', '圈舍', '畜禽', '生猪', '肉牛', '蛋鸡', '肉鸡',
  '精准畜牧', '智能养殖', '智慧牧场',
  '自动饲喂', '自动挤奶', '机器人挤奶',
  '环境控制', '通风', '饲料',
  '健康监测', '疾病检测', '行为分析',
  // 中文 - 水产
  '水产', '渔业', '鱼', '虾', '养殖池',
];

// 短关键词列表（<=5字符），需要用词边界匹配避免子串误匹配
const SHORT_TECH_KWS = ['iot', 'gps', 'gnss', 'nlp', 'uav', 'uas', 'rfid', 'ndvi'];
const SHORT_AG_KWS = ['farm', 'crop', 'soil', 'rice', 'corn', 'weed', 'pig', 'cow', 'dairy', 'fish', 'goat', 'duck', 'hen', 'layer'];

// 歧义词：匹配后需检查上下文，命中 negative patterns 则判定为非农业语义
const AMBIGUOUS_KWS: Record<string, RegExp[]> = {
  layer: [/supply.chain.{0,15}layer/i, /management.{0,15}layer/i, /organizati.{0,15}layer/i, /layer.{0,15}(of the|of a|between)/i],
  traceability: [/(visit|read|learn|discover|explore).{0,30}traceability/i, /traceability.{0,20}(page|platform|solution|program)/i],
};

function matchKeyword(text: string, kw: string): boolean {
  // 歧义词：先做词边界匹配，再排除非农业上下文
  if (AMBIGUOUS_KWS[kw]) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!regex.test(text)) return false;
    return !AMBIGUOUS_KWS[kw].some((neg) => neg.test(text));
  }
  // 短关键词用正则词边界匹配
  if (kw.length <= 5 || SHORT_TECH_KWS.includes(kw) || SHORT_AG_KWS.includes(kw)) {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  }
  return text.includes(kw);
}

function smartAgScore(text: string): number {
  const lower = text.toLowerCase();
  const hitTech = TECH_KEYWORDS.some((kw) => matchKeyword(lower, kw));
  const hitAg = AG_KEYWORDS.some((kw) => matchKeyword(lower, kw));
  if (!hitTech || !hitAg) return 0;
  let hits = 0;
  for (const kw of [...TECH_KEYWORDS, ...AG_KEYWORDS]) {
    if (matchKeyword(lower, kw)) hits++;
  }
  return hits;
}

const SMART_AG_THRESHOLD = 2; // 技术+农业各至少1个，总命中至少2个（宁可放过边缘，不可漏掉智慧农业）

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
async function scrapeArticlesBatch(items: any[]): Promise<{ scraped: number; failed: number; scrapedIds: string[] }> {
  const toScrape = items.filter((item) => !item.scrapedAt);
  if (toScrape.length === 0) {
    console.log(`  所有 ${items.length} 条已爬取过，跳过`);
    return { scraped: 0, failed: 0, scrapedIds: [] };
  }

  console.log(`  需爬取: ${toScrape.length} 条`);
  let scraped = 0;
  let failed = 0;
  const scrapedIds: string[] = [];

  // 域名级限速：同域名请求间隔 DOMAIN_DELAY_MS，防 429
  // 使用 Promise 链避免并发竞态（同一域名的多个请求串行排队）
  const domainQueues = new Map<string, Promise<void>>();
  async function scrapeWithDomainDelay(url: string, config?: string) {
    let domain = 'unknown';
    try { domain = new URL(url).hostname; } catch { /* ignore */ }

    // 排队：同一域名串行等待，不同域名并行
    const prev = domainQueues.get(domain) || Promise.resolve();
    const next = prev.then(() => new Promise<void>((r) => setTimeout(r, DOMAIN_DELAY_MS)));
    domainQueues.set(domain, next);
    await next;

    return scrapeArticle(url, config);
  }

  for (let i = 0; i < toScrape.length; i += CONCURRENCY) {
    const batch = toScrape.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((item) => scrapeWithDomainDelay(item.url, item.source?.scrapeConfig))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const item = batch[j];
      if (result.status === 'fulfilled' && result.value) {
        const { contentText, images, author, publishedAt } = result.value;
        await prisma.item.update({
          where: { id: item.id },
          data: {
            contentFull: contentText,
            images: JSON.stringify(images),
            author,
            ...(publishedAt ? { publishedAt } : {}),
            scrapedAt: new Date(),
            scrapeMethod: 'web_scrape',
          },
        });
        scraped++;
        scrapedIds.push(item.id);
      } else {
        // 爬取失败：不标记 scrapedAt，下次管线可重试
        failed++;
      }
    }

    if (i + CONCURRENCY < toScrape.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`  爬取完成: ${scraped} 成功, ${failed} 失败`);
  return { scraped, failed, scrapedIds };
}

// ========== AI 处理（统一提示词） ==========
async function callDeepSeek(prompt: string, maxTokens = 16000): Promise<string> {
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
      max_tokens: maxTokens,
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
  const contentSnippet = content ? content.slice(0, 10000) : '';
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
- pig: 猪业（养猪、猪场管理、猪病防控、猪肉加工、饲料营养、育种等）
- poultry: 禽业（肉鸡/蛋鸡、鸭、禽舍管理、禽病、禽肉蛋品加工等）
- cattle: 牛业（肉牛/奶牛养殖、牧场管理、乳品、牛肉加工、牛病防治等）
- sheep: 羊业（肉羊/毛用羊养殖、牧场管理、羊毛加工等）
- field: 大田作物（小麦/玉米/水稻/大豆等、田间管理、植保、农机等）
- fruit: 果蔬（水果/蔬菜种植、采摘、采后处理、冷链物流等）
- horticulture: 园艺（温室、花卉、苗圃、观赏植物、设施园艺等）
- general: 综合/跨领域（仅当文章明显涉及多个品类或完全无法归入以上任何一类时选此项）

同时提供中文翻译和推荐理由。全文翻译要求：
- 只翻译文章正文内容，**不要翻译以下杂项**：标题、日期、作者署名、来源标签/category tags、图片说明（如"图片来源：xxx"）、byline、share buttons文字
- 忠实原文，完整翻译所有段落，不要遗漏，不要截断
- 保留原文的段落结构，段落之间用两个换行符(\\n\\n)分隔
- 文章中的小标题（如独立成行的短句标题）保留并加粗，格式为：**小标题**
- 如果原文很长，也必须翻译完整，不得在中间停止

请直接返回JSON（不要markdown包裹）:
{
  "relevance": 数,
  "importance": 数,
  "novelty": 数,
  "readability": 数,
  "actionability": 数,
  "subcategory": "pig|poultry|cattle|sheep|field|fruit|horticulture|general",
  "titleZh": "中文标题(简短准确)",
  "summaryZh": "中文摘要(100-150字，说明核心内容和价值)",
  "translationZh": "全文中文翻译(只翻译正文，去掉标题/日期/作者/标签/图片来源等杂项，段落用\\n\\n分隔，小标题加粗)",
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

/**
 * Stage 1 语义筛选：轻量 AI 调用判断文章是否与智慧畜牧相关
 * 只在通过后才进入 Stage 2 完整评分+翻译，节省 token
 * API 失败时默认通过（保守侧，不漏文章）
 */
async function screeningEvaluate(titleEn: string, content?: string): Promise<boolean> {
  const snippet = content ? content.slice(0, 1500) : '';
  const prompt = `判断这篇新闻是否与智慧农业或智慧畜牧相关。

相关：在养殖业或种植业中应用科技，包括但不限于：
  - 畜牧科技：自动饲喂、机器人挤奶、智能环控、精准畜牧、健康监测、疾病检测、行为分析、体重估算、育种基因、基因组学、畜舍自动化、粪污处理技术、饲料优化、动物福利监测
  - 种植科技：精准农业、自动驾驶拖拉机、喷洒无人机、除草机器人、温室自动化、植物工厂、水培、灌溉自动化、变量施肥、作物监测
  - 通用农业科技：IoT、AI、机器学习、计算机视觉、机器人、无人机、传感器、数据分析、数字孪生、区块链溯源、遥测、卫星遥感

不相关：纯市场价格行情、大宗商品交易、不带科技视角的消费者趋势报道、纯政策法规解读（不含技术）、食品零售促销、美食/烹饪内容、纯财经投资新闻（不含农业科技公司）、非农业的科技新闻（智慧城市/医疗/金融/零售等）

标题: ${titleEn}
${snippet ? `内容: ${snippet}` : ''}

只返回 JSON，不要其他内容：
{"shouldInclude": true} 或 {"shouldInclude": false}`;

  try {
    const raw = await callDeepSeek(prompt, 200);
    const parsed = JSON.parse(cleanJson(raw));
    return parsed.shouldInclude === true;
  } catch (e: any) {
    console.error(`  [AI] 语义筛选失败 "${titleEn.slice(0, 40)}": ${e.message}，默认通过`);
    return true;
  }
}

/**
 * 续翻：翻译被截断时，把剩余原文再翻一次拼上去
 * 策略：用最后几段已翻译内容定位原文断点，翻译剩余部分
 */
async function continueTranslation(
  titleEn: string,
  fullContent: string,
  partialTranslation: string
): Promise<string> {
  // 已翻译文本去掉末尾省略号
  const cleanPartial = partialTranslation.replace(/[.……]+$/, '').trim();

  // 用已翻译的最后一段在原文中搜索断点
  // 取已翻译最后 200 字符作为锚点
  const anchor = cleanPartial.slice(-200);

  // 简单策略：按段落估算已翻译比例，取剩余内容
  const originalParagraphs = fullContent.split(/\n+/).filter(p => p.trim().length > 20);
  const translatedChars = cleanPartial.length;
  const totalChars = fullContent.length;
  const ratio = Math.min(translatedChars / totalChars, 0.95);

  // 从断点后的段落开始翻译
  const startIdx = Math.floor(originalParagraphs.length * ratio);
  const remaining = originalParagraphs.slice(startIdx).join('\n\n');

  if (!remaining.trim()) return partialTranslation;

  const prompt = `请将以下英文文章片段翻译成中文。只输出翻译结果，不要任何解释、标题、前缀。

要求：
- 忠实原文，完整翻译所有段落，不要遗漏
- 保留段落结构，段落之间用两个换行符(\\n\\n)分隔
- 小标题保留并加粗：**小标题**
- 不要重复以下已翻译的内容，只翻译剩余部分

原文剩余部分:
${remaining.slice(0, 6000)}`;

  const continuation = await callDeepSeek(prompt);
  if (!continuation.trim()) return partialTranslation;

  return cleanPartial + '\n\n' + continuation.trim();
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

const VALID_SUBCATEGORIES = ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture', 'general'];
const SUBCATEGORY_TO_CATEGORY: Record<string, string> = {
  pig: 'livestock', poultry: 'livestock', cattle: 'livestock', sheep: 'livestock',
  field: 'crop', fruit: 'crop', horticulture: 'crop',
  general: 'aggtech',
};

function classifyItem(item: any, source: any, aiSubcategory?: string): { category: string; subcategory: string } {
  // 优先用 AI 返回的分类
  if (aiSubcategory && VALID_SUBCATEGORIES.includes(aiSubcategory)) {
    return { category: SUBCATEGORY_TO_CATEGORY[aiSubcategory], subcategory: aiSubcategory };
  }

  // 回退：source.category 大类 + defaultSubcategory
  if (source.category === 'livestock') {
    return { category: 'livestock', subcategory: source.defaultSubcategory || 'cattle' };
  }
  if (source.category === 'crop') {
    return { category: 'crop', subcategory: source.defaultSubcategory || 'field' };
  }

  // 回退：关键词匹配
  const text = `${item.titleEn || ''} ${item.contentHtml || ''} ${item.contentFull || ''}`.toLowerCase();

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
  let totalDedup = 0;
  const seenTitles: string[] = [];
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
          publishedAt: listing.publishedAt || null,
          contentHtml: '',
        });
      }
    }

    totalRaw += raw.length;
    const filtered = relevanceFilter(raw, source);
    let saved = 0;
    let dedup = 0;
    for (const item of filtered) {
      // 标题去重：跨源相似标题跳过
      if (isDuplicate(item.title, seenTitles)) {
        dedup++;
        continue;
      }
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
            species: source.defaultCategory || 'aggtech',
            techTags: '',
            isRelevant: true,
          },
        });
        saved++;
        seenTitles.push(normalizeTitle(item.title));
      } catch (e: any) {
        // URL 重复或其他 DB 错误，静默跳过
      }
    }
    totalSaved += saved;
    totalDedup += dedup;
    console.log(`  ${source.name}: ${raw.length} raw → ${filtered.length} filtered → ${saved} saved${dedup > 0 ? ` (${dedup} 重复跳过)` : ''}`);
    await prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
  }
  console.log(`  总计: ${totalRaw} raw → ${totalSaved} saved (${totalDedup} 重复跳过)\n`);

  // Step 2.5: 修正错误的 publishedAt（以管线运行时间作为发表时间的文章）
  // 检测条件：已爬取 + publishedAt 与 scrapedAt 相差 < 5 分钟（说明日期是 new Date() fallback）
  const suspiciousItems = await prisma.$queryRaw`
    SELECT id, titleEn, publishedAt, scrapedAt
    FROM Item
    WHERE isRelevant = 1
      AND scrapedAt IS NOT NULL
      AND publishedAt IS NOT NULL
      AND ABS(CAST(julianday(publishedAt) - julianday(scrapedAt) AS REAL)) * 86400 < 300
  ` as { id: string; titleEn: string; publishedAt: Date; scrapedAt: Date }[];

  if (suspiciousItems.length > 0) {
    console.log(`  修正 ${suspiciousItems.length} 条日期可疑的文章（重置爬取状态）`);
    for (const item of suspiciousItems) {
      await prisma.item.update({
        where: { id: item.id },
        data: { scrapedAt: null },
      });
    }
    console.log(`  已重置，将在 Step 3 重新爬取\n`);
  }

  // Step 3: 全文爬取
  console.log('[3/5] 全文爬取...');

  // 前置：重置 contentFull 为空但已标记爬取的文章（上次爬取失败或数据丢失）
  const emptyContentItems = await prisma.item.findMany({
    where: { isRelevant: true, contentFull: null, scrapedAt: { not: null } },
    select: { id: true },
  });
  if (emptyContentItems.length > 0) {
    console.log(`  重置 ${emptyContentItems.length} 条无正文但已标记爬取的文章`);
    for (const item of emptyContentItems) {
      await prisma.item.update({
        where: { id: item.id },
        data: { scrapedAt: null, scrapeMethod: null },
      });
    }
  }

  const unscraped = await prisma.item.findMany({
    where: { scrapedAt: null, isRelevant: true },
    include: { source: true },
  });
  const { scraped: scrapedCount, failed: failedCount, scrapedIds } = await scrapeArticlesBatch(unscraped);
  console.log(`  全文爬取完成: ${scrapedCount} 成功, ${failedCount} 失败\n`);

  // Step 3.5: 增量重新评估相关性（仅本轮新爬取的文章）
  console.log('[3.5] 重新评估新爬文章相关性...');
  const sourceKwMap: Record<string, { core: string[]; exclude: string[] }> = {};
  for (const source of config.sources) {
    sourceKwMap[source.id] = {
      core: (source.coreKeywords || '').split('|').map((k: string) => k.trim().toLowerCase()),
      exclude: (source.excludeKeywords || '').split('|').map((k: string) => k.trim().toLowerCase()),
    };
  }
  let demoted = 0;
  if (scrapedIds.length > 0) {
    const existingItems = await prisma.item.findMany({
      where: { id: { in: scrapedIds }, isRelevant: true },
      include: { source: true },
    });
    for (const item of existingItems) {
      const kw = sourceKwMap[item.sourceId];
      if (!kw) continue;
      const text = `${item.titleEn} ${item.contentHtml || ''} ${item.contentFull || ''}`.toLowerCase();
      const matchKw = (t: string, k: string) => k.length <= 5 ? new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t) : t.includes(k);
      const hitCore = kw.core.some((k: string) => k && matchKw(text, k));
      const hitExclude = kw.exclude.some((k: string) => k && matchKw(text, k));
      if (!hitCore || hitExclude) {
        await prisma.item.update({
          where: { id: item.id },
          data: { isRelevant: false, techTags: 'relevance_demoted' },
        });
        demoted++;
      }
    }
    console.log(`  降级 ${demoted} 条不再相关的文章\n`);
  } else {
    console.log('  本次无新爬文章，跳过\n');
  }

  // Step 3.7: 智慧农业预筛（仅本轮新爬取的文章）
  console.log('[3.7] 智慧农业预筛...');
  if (scrapedIds.length > 0) {
    const allRelevant = await prisma.item.findMany({
      where: { id: { in: scrapedIds }, isRelevant: true },
      select: { id: true, titleEn: true, contentFull: true, contentHtml: true },
    });
    const { accepted: preAccepted, rejected: preRejected } = preFilterItems(allRelevant);
    if (preRejected.length > 0) {
      console.log(`  预筛淘汰 ${preRejected.length} 条（技术+农业关键词不足 ${SMART_AG_THRESHOLD} 个）`);
      for (const item of preRejected) {
        await prisma.item.update({
          where: { id: item.id },
          data: { isRelevant: false, techTags: 'pre_filter_rejected' },
        });
      }
    }
    console.log(`  预筛通过: ${preAccepted.length} 条\n`);
  } else {
    console.log('  本次无新爬文章，跳过\n');
  }

  // Step 4 前置：清除明显过短的截断翻译（<200字且以省略号结尾），让管线重新生成
  // 长翻译即使截断也接受，避免无限重试烧 token
  const withTranslation = await prisma.item.findMany({
    where: { isRelevant: true, translationZh: { not: null } },
    select: { id: true, translationZh: true },
  });
  let clearedTruncated = 0;
  for (const item of withTranslation) {
    const t = item.translationZh || '';
    if ((t.endsWith('......') || t.endsWith('……')) && t.length < 200) {
      await prisma.item.update({
        where: { id: item.id },
        data: { translationZh: null },
      });
      clearedTruncated++;
    }
  }
  if (clearedTruncated > 0) {
    console.log(`  清除 ${clearedTruncated} 条过短的截断翻译，将重新生成\n`);
  }

  // Step 4: AI 处理（统一提示词，循环处理所有待处理 item）
  console.log('[4/5] AI 处理（统一分析）...');
  const pending = await prisma.item.findMany({
    where: { OR: [{ aiScores: null }, { category: null }, { translationZh: null }], isRelevant: true },
    include: { source: true },
  });
  console.log(`  待处理: ${pending.length} 条\n`);

  let processed = 0;
  let rejected = 0;
  for (const item of pending) {
    try {
      const contentForAI = item.contentFull || item.contentHtml || '';

      // Stage 1: 语义筛选（轻量 AI 调用，判断是否与智慧畜牧相关）
      const shouldInclude = await screeningEvaluate(item.titleEn, contentForAI);
      if (!shouldInclude) {
        await prisma.item.update({
          where: { id: item.id },
          data: { isRelevant: false, techTags: 'ai_rejected' },
        });
        rejected++;
        console.log(`  ✗ [AI_REJECTED] ${item.titleEn.slice(0, 40)}`);
        continue;
      }

      // Stage 2: 完整分析（现有逻辑）
      const result = await analyzeItem(item.titleEn, contentForAI);

      // 检测翻译是否被截断，循环续翻直到翻完或达到上限
      let translation = result.translationZh || '';
      let continuationAttempts = 0;
      const MAX_CONTINUATIONS = 3;
      while (contentForAI && translation && (translation.endsWith('……') || translation.endsWith('......')) && continuationAttempts < MAX_CONTINUATIONS) {
        continuationAttempts++;
        console.log(`    ⚠ 翻译截断（第 ${continuationAttempts} 次续翻）...`);
        try {
          translation = await continueTranslation(item.titleEn, contentForAI, translation);
          console.log(`    ✓ 续翻完成 (${translation.length} 字)`);
        } catch (e: any) {
          console.error(`    ✗ 续翻失败: ${e.message}，使用原截断翻译`);
          break;
        }
      }

      const scores = {
        relevance: result.relevance,
        importance: result.importance,
        novelty: result.novelty,
        readability: result.readability,
        actionability: result.actionability,
      };
      const qualityScore = calculateQualityScore(scores, item.source.tier, item.multiSourceCount);
      const { category, subcategory } = classifyItem(item, item.source, result.subcategory);
      const species = subcategory || item.species;

      await prisma.item.update({
        where: { id: item.id },
        data: {
          aiScores: JSON.stringify(scores),
          titleZh: result.titleZh,
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
      console.log(`  ✓ [${qualityScore}] ${result.titleZh || item.titleEn.slice(0, 40)}`);
    } catch (e: any) {
      console.error(`  ✗ ${item.titleEn.slice(0, 40)}: ${e.message}`);
    }
  }
  console.log(`  处理完成: ${processed} 篇通过, ${rejected} 篇被 AI 拒稿\n`);

  // Step 4.5: 修复 species 字段（将 subcategory 同步到 species）
  const speciesMap: Record<string, string> = {
    pig: 'pig', poultry: 'poultry', cattle: 'cattle', sheep: 'sheep',
    field: 'field', fruit: 'fruit', horticulture: 'horticulture',
  };
  const needsFix = await prisma.item.findMany({
    where: {
      isRelevant: true,
      subcategory: { in: Object.keys(speciesMap) },
      NOT: { aiScores: null },
    },
  });
  let fixedCount = 0;
  for (const item of needsFix) {
    const correctSpecies = speciesMap[item.subcategory!];
    if (item.species !== correctSpecies) {
      await prisma.item.update({
        where: { id: item.id },
        data: { species: correctSpecies },
      });
      fixedCount++;
    }
  }
  if (fixedCount > 0) console.log(`  修复 ${fixedCount} 条 item 的 species 字段`);

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
    isFeatured: (() => {
      const tier = item.source?.tier || 'T2';
      const qs = item.qualityScore || 0;
      if (tier === 'T1') return qs >= 60;
      if (tier === 'T1.5') return qs >= 70;
      return qs >= 80; // T2
    })(),
    isHot: item.isHot,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : '',
  });

  // 详情格式（含全文、图片等）
  // contentHtml 在导出前净化：移除危险标签/属性/协议，防止存储型 XSS
  const sanitizeHtml = (html: string): string =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<embed[\s\S]*?<\/embed>/gi, '')
      .replace(/<object[\s\S]*?<\/object>/gi, '')
      .replace(/<svg[\s\S]*?on\w+\s*=[\s\S]*?>/gi, '')
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\son\w+\s*=\s*\S+/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/data:\s*text\/html/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '');

  const formatDetailItem = (item: any) => ({
    ...formatListItem(item),
    contentFull: item.contentFull || '',
    translationZh: item.translationZh || '',
    images: item.images ? (() => { try { return JSON.parse(item.images); } catch { return []; } })() : [],
    author: item.author || '',
    contentHtml: item.contentHtml ? sanitizeHtml(item.contentHtml) : '',
    scrapeMethod: item.scrapeMethod || 'rss',
  });

  const freshFormatted = allItems.map(formatListItem);

  // 增量合并：读取旧 items.json，新数据按 ID 覆盖，旧数据保留
  // 注意：旧数据中未出现在 DB 查询结果中的 ID 不再保留
  const existingPath = join(outDir, 'items.json');
  let existingFormatted: any[] = [];
  if (existsSync(existingPath)) {
    try { existingFormatted = JSON.parse(readFileSync(existingPath, 'utf-8')); } catch {}
  }
  const freshIds = new Set(freshFormatted.map((i: any) => i.id));
  const existingMap = new Map(existingFormatted.filter((i: any) => freshIds.has(i.id)).map((i: any) => [i.id, i]));
  for (const item of freshFormatted) existingMap.set(item.id, item);
  const formatted = Array.from(existingMap.values())
    .sort((a: any, b: any) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const preserved = formatted.length - freshFormatted.length;

  // 列表 JSON
  writeFileSync(join(outDir, 'items.json'), JSON.stringify(formatted, null, 2));
  console.log(`  items.json: ${formatted.length} 条 (${freshFormatted.length} new + ${preserved} preserved)`);

  // Item IDs 列表（供 generateStaticParams 使用）
  const itemIds = formatted.map((item: any) => item.id);
  writeFileSync(join(outDir, 'item-ids.json'), JSON.stringify(itemIds));

  // 详情 JSON（每条一个文件）
  const detailDir = join(outDir, 'items');
  mkdirSync(detailDir, { recursive: true });

  // 清理孤立 detail 文件（不在合并后导出列表中的旧文件）
  const validIds = new Set(formatted.map((item: any) => item.id));
  const existingDetailFiles = readdirSync(detailDir);
  let cleanedFiles = 0;
  for (const file of existingDetailFiles) {
    if (file.endsWith('.json')) {
      const id = file.replace('.json', '');
      if (!validIds.has(id)) {
        unlinkSync(join(detailDir, file));
        cleanedFiles++;
      }
    }
  }
  if (cleanedFiles > 0) console.log(`  清理 ${cleanedFiles} 个孤立 detail 文件`);
  for (const item of allItems) {
    const detail = formatDetailItem(item);
    writeFileSync(join(detailDir, `${item.id}.json`), JSON.stringify(detail, null, 2));
  }
  console.log(`  items/*.json: ${allItems.length} 个详情文件`);

  // 热点
  const hot = formatted.filter((i) => i.isHot).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 5);
  writeFileSync(join(outDir, 'hot-items.json'), JSON.stringify(hot, null, 2));

  // 统计
  const stats = {
    sources: config.sources.length,
    items: formatted.length,
    featured: formatted.filter((i) => i.isFeatured).length,
    lastUpdated: new Date().toISOString(),
  };
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  // 按物种（含种植业 + 综合）
  for (const sp of ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture', 'general']) {
    const spItems = sp === 'general'
      ? formatted.filter((i) => i.subcategory === 'general')
      : formatted.filter((i) => i.subcategory === sp || i.species.includes(sp));
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
  .finally(async () => {
    await closeBrowser().catch(() => {});
    prisma.$disconnect().catch(() => {});
    // 防止 prisma disconnect 卡住导致进程不退出
    setTimeout(() => process.exit(0), 5000);
  });
