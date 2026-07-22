/**
 * 公众号历史文章批量导入脚本
 *
 * 从 WeChat Download API 拉取 5 个公众号 5 月至今的文章
 * → 关键词预筛（技术+农业）→ 去重 → 入库
 *
 * 信息漏斗原则：
 *   第一层：收集所有 URL（5月至今）
 *   第二层：关键词预筛（技术词+农业词匹配 title+digest）
 *   第三层+：后续由主管线负责（AI 语义筛选 + 评分翻译）
 *
 * 用法: npx tsx scripts/import-wechat.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== 公众号配置 ==========
const WECHAT_ACCOUNTS = [
  { id: 'wx_lvshui',         name: '绿水智慧农业',   fakeid: 'MzI2NDY2OTQ0Mg==' },
  { id: 'wx_dji',            name: 'DJI大疆农业',    fakeid: 'MzIzOTQwMzA5Ng==' },
  { id: 'wx_zhonghuanyida',  name: '中环易达',       fakeid: 'MzA3MzI0NDkyNQ==' },
  { id: 'wx_digits_agri',    name: '数字农业 Insights', fakeid: 'MzI3OTQ0MDM1Mg==' },
  { id: 'wx_shuichan',       name: '智慧水产',       fakeid: 'MzA5ODQwNDg3NA==' },
];

const API_BASE = 'http://localhost:5000';
const SINCE_DATE = new Date('2026-05-01T00:00:00+08:00'); // 5月1日北京时间
const SINCE_TIMESTAMP = Math.floor(SINCE_DATE.getTime() / 1000);

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
  '无人机',
  '物联网', '传感器', '穿戴', '射频', '摄像头', '光谱',
  '精准', '智慧农业', '智慧牧场', '数字农业',
  '变量', '产量图', '作物监测', '畜牧监测',
  '遥感', '卫星',
  '数据驱动', '云平台', '看板', '区块链', '溯源', '数字孪生',
  'AI', '大模型', '深度学习',
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
  'seedling', 'nursery', 'acreage', 'hectare', 'protected cultivation',
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
  'insect farm', 'apiculture', 'beekeeping',
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
  '环境控制', '通风', '饲料',
  '健康监测', '疾病检测', '行为分析',
  '水产', '渔业', '鱼', '虾', '养殖池',
  '农机', '农技', '农产', '化肥', '农资', '农事',
];

// 短/歧义词特殊处理
const AMBIGUOUS_KWS: Record<string, RegExp[]> = {
  layer: [/supply.chain.{0,15}layer/i, /management.{0,15}layer/i, /organizati.{0,15}layer/i],
  traceability: [/(visit|read|learn|discover|explore).{0,30}traceability/i],
};

/** 判断是否包含 CJK（中日韩）统一表意文字 */
function hasCJK(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

/** 中文词直接用 includes（\b 边界对 CJK 无效），ASCII 短词用正则词边界 */
function matchKeyword(text: string, kw: string): boolean {
  if (AMBIGUOUS_KWS[kw]) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!regex.test(text)) return false;
    return !AMBIGUOUS_KWS[kw].some((neg) => neg.test(text));
  }
  // 含中文的关键词：直接用 includes（\b 词边界对 CJK 字符无效）
  if (hasCJK(kw)) return text.includes(kw.toLowerCase());
  // 纯 ASCII 短词：用 \b 词边界避免子串误匹配
  if (kw.length <= 5) {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  }
  return text.includes(kw);
}

function preFilter(title: string, digest: string): boolean {
  const text = `${title} ${digest}`.toLowerCase();
  const hitTech = TECH_KEYWORDS.some((kw) => matchKeyword(text, kw));
  const hitAg = AG_KEYWORDS.some((kw) => matchKeyword(text, kw));
  if (!hitTech || !hitAg) return false;
  let hits = 0;
  for (const kw of [...TECH_KEYWORDS, ...AG_KEYWORDS]) {
    if (matchKeyword(text, kw)) hits++;
  }
  return hits >= 2;
}

// ========== API 调用 ==========

async function fetchArticleList(fakeid: string, begin: number, count: number): Promise<any> {
  const url = `${API_BASE}/api/public/articles?fakeid=${fakeid}&begin=${begin}&count=${count}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`API failed: ${data.error}`);
  return data.data;
}

// ========== 主流程 ==========

async function main() {
  console.log('=== 公众号历史文章批量导入 ===\n');
  console.log(`筛选起始时间: ${SINCE_DATE.toISOString()} (timestamp: ${SINCE_TIMESTAMP})`);
  console.log(`公众号数: ${WECHAT_ACCOUNTS.length}\n`);

  let totalCollected = 0;
  let totalPassed = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  for (const account of WECHAT_ACCOUNTS) {
    console.log(`── ${account.name} (${account.id}) ──`);

    let begin = 0;
    const PAGE_SIZE = 50;
    let accountCollected = 0;
    let accountPassed = 0;
    let accountImported = 0;
    let accountSkipped = 0;
    let reachedEnd = false;

    while (!reachedEnd) {
      // 拉取一页
      const data = await fetchArticleList(account.fakeid, begin, PAGE_SIZE);
      const articles = data.articles || [];

      if (articles.length === 0) break;

      for (const article of articles) {
        // 检查时间
        if (article.create_time < SINCE_TIMESTAMP) {
          reachedEnd = true; // API 按时间倒序，遇到早于 5月的说明后面都是更旧的
          break;
        }

        accountCollected++;

        // 第二层：关键词预筛
        if (!preFilter(article.title, article.digest || '')) {
          accountSkipped++;
          continue;
        }
        accountPassed++;

        // 去重 + 入库
        try {
          const existing = await prisma.item.findUnique({ where: { url: article.link } });
          if (existing) {
            // 已在库中：如果之前标记为不相关但预筛通过了，纠正
            if (!existing.isRelevant) {
              await prisma.item.update({
                where: { id: existing.id },
                data: { isRelevant: true, techTags: '' },
              });
              console.log(`  ↻ 恢复: ${article.title.substring(0, 40)}`);
              accountImported++;
            }
            continue;
          }

          await prisma.item.create({
            data: {
              sourceId: account.id,
              titleEn: article.title,
              url: article.link,
              publishedAt: new Date(article.create_time * 1000),
              contentHtml: article.digest || '',
              species: 'aggtech',
              techTags: '',
              isRelevant: true,
              // 公众号：不爬全文，直接标记已爬取
              scrapedAt: new Date(),
              scrapeMethod: 'wechat_api',
            },
          });
          accountImported++;
        } catch (e: any) {
          console.error(`  ✗ 入库失败: ${article.title.substring(0, 40)}: ${e.message}`);
        }
      }

      begin += articles.length;
      // 限速：不要太快调用 API
      await new Promise(r => setTimeout(r, 500));

      // 进度汇报
      process.stdout.write(`\r  已扫描 ${accountCollected} 篇，预筛通过 ${accountPassed}，导入 ${accountImported}`);
    }

    console.log(`\n  完成: 扫描 ${accountCollected} → 预筛通过 ${accountPassed} → 导入 ${accountImported} (跳过 ${accountSkipped})\n`);
    totalCollected += accountCollected;
    totalPassed += accountPassed;
    totalImported += accountImported;
    totalSkipped += accountSkipped;
  }

  console.log('═══════════════════════════════');
  console.log(`总计: 扫描 ${totalCollected} → 预筛通过 ${totalPassed} → 导入 ${totalImported} (跳过 ${totalSkipped})`);
  console.log('═══════════════════════════════\n');

  // 确认源存在
  console.log('检查信源配置...');
  for (const account of WECHAT_ACCOUNTS) {
    const source = await prisma.source.findUnique({ where: { id: account.id } });
    if (!source) {
      console.warn(`  ⚠ 信源 ${account.id} 不存在，请在 sources.json 中检查`);
    } else {
      console.log(`  ✓ ${account.name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect().catch(() => {}));
