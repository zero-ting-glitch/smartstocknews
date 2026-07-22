/**
 * 补爬 + 重跑 AI：针对未爬全文就进了 AI 管线的文章
 *
 * 先补爬 13 篇缺正文的文章，再重新 AI 评分+翻译
 * 用法: npx tsx scripts/fix-articles.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { scrapeArticle, closeBrowser } from '../src/lib/collector/scraper';

const prisma = new PrismaClient();

async function callDeepSeek(prompt: string, maxTokens = 16000): Promise<string> {
  const res = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

function cleanJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  return s;
}

function hasChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

async function analyzeItem(titleEn: string, content?: string) {
  const contentSnippet = content ? content.slice(0, 10000) : '';
  const isChinese = hasChinese(contentSnippet || titleEn);
  const fullTranslationSection = isChinese ? '' : `
同时提供中文翻译和推荐理由。全文翻译要求：
- 只翻译文章正文内容，不要翻译标题/日期/作者/图片说明等杂项
- 忠实原文，完整翻译所有段落，不要遗漏，不要截断
- 段落之间用两个换行符(\\n\\n)分隔，小标题保留并加粗：**小标题**`;
  const translationField = isChinese ? '' : `  "translationZh": "全文中文翻译",
`;
  const titleZhField = isChinese ? '' : `  "titleZh": "中文标题(简短准确)",
`;

  const prompt = `你是智慧畜牧行业资深编辑。对以下新闻进行全面分析。

标题: ${titleEn}
${contentSnippet ? `内容: ${contentSnippet}` : ''}

评分维度（每项0-100）: relevance, importance, novelty, readability, actionability
分类: pig|poultry|cattle|sheep|field|fruit|horticulture|general（不要轻易选general）
${fullTranslationSection}
请直接返回JSON:
{
  "relevance": 数, "importance": 数, "novelty": 数, "readability": 数, "actionability": 数,
  "subcategory": "分类",
${titleZhField}  "summaryZh": "中文摘要(100-150字)",
${translationField}  "featuredReason": "推荐理由"
}`;

  const raw = await callDeepSeek(prompt);
  return JSON.parse(cleanJson(raw));
}

function calculateQualityScore(scores: any, tier: string, multiSourceCount: number): number {
  const tierWeights: Record<string, number> = { T1: 1.0, 'T1.5': 0.7, T2: 0.4 };
  const avg = (scores.relevance + scores.importance + scores.novelty + scores.readability + scores.actionability) / 5;
  return Math.round(avg * (tierWeights[tier] || 0.4) + Math.min(multiSourceCount, 3) * 5);
}

const VALID_SUBCATEGORIES = ['pig', 'poultry', 'cattle', 'sheep', 'field', 'fruit', 'horticulture', 'general'];
const SUBCATEGORY_TO_CATEGORY: Record<string, string> = {
  pig: 'livestock', poultry: 'livestock', cattle: 'livestock', sheep: 'livestock',
  field: 'crop', fruit: 'crop', horticulture: 'crop', general: 'aggtech',
};

async function main() {
  console.log('=== 补爬 + 重跑 AI ===\n');

  // 1. 获取需要补爬的文章
  const toFix = await prisma.$queryRaw`
    SELECT i.id, i.titleEn, i.url, i.contentHtml, s.name as sourceName, s.tier
    FROM Item i
    JOIN Source s ON i.sourceId = s.id
    WHERE i.isRelevant = 1
      AND i.aiScores IS NOT NULL
      AND i.contentFull IS NULL
      AND i.sourceId NOT LIKE 'wx_%'
    ORDER BY i.publishedAt DESC
  ` as any[];

  console.log(`需补爬: ${toFix.length} 篇\n`);

  let scraped = 0;
  let failed = 0;

  for (const item of toFix) {
    console.log(`[${scraped + failed + 1}/${toFix.length}] ${(item.titleEn as string).substring(0, 50)}`);

    try {
      const result = await scrapeArticle(item.url);

      if (result?.contentText && result.contentText.length > 200) {
        // 保存爬取结果
        await prisma.item.update({
          where: { id: item.id as string },
          data: {
            contentFull: result.contentText,
            images: JSON.stringify(result.images || []),
            author: result.author || '',
            ...(result.publishedAt ? { publishedAt: new Date(result.publishedAt) } : {}),
            scrapedAt: new Date(),
            scrapeMethod: 'web_scrape',
          },
        });

        // 重新 AI 分析
        console.log(`  正文 ${result.contentText.length} 字, 图片 ${result.images?.length || 0} 张 → AI 重新分析...`);

        const aiResult = await analyzeItem(item.titleEn, result.contentText);
        const isChineseContent = hasChinese(result.contentText || item.titleEn);
        const titleZh = aiResult.titleZh || (isChineseContent ? item.titleEn : '');
        const translation = aiResult.translationZh || '';
        const scores = {
          relevance: aiResult.relevance, importance: aiResult.importance,
          novelty: aiResult.novelty, readability: aiResult.readability, actionability: aiResult.actionability,
        };
        const qualityScore = calculateQualityScore(scores, item.tier, 1);
        const subcategory = aiResult.subcategory && VALID_SUBCATEGORIES.includes(aiResult.subcategory) ? aiResult.subcategory : 'general';
        const category = SUBCATEGORY_TO_CATEGORY[subcategory] || 'aggtech';

        await prisma.item.update({
          where: { id: item.id as string },
          data: {
            aiScores: JSON.stringify(scores),
            titleZh,
            summaryZh: aiResult.summaryZh || '',
            translationZh: translation,
            featuredReason: aiResult.featuredReason || '',
            qualityScore,
            isHot: qualityScore >= 75,
            category,
            subcategory,
            species: subcategory,
          },
        });

        console.log(`  ✓ 评分 ${qualityScore}, 翻译 ${translation.length} 字`);
        scraped++;
      } else {
        // 爬不到全文但之前有 RSS snippet 的保留原 AI 结果
        console.log(`  ⚠ 爬取结果不足 (${result?.contentText?.length || 0}字)，保留原 AI 数据`);
        // 至少标记已尝试爬取，避免重试
        await prisma.item.update({
          where: { id: item.id as string },
          data: { scrapeMethod: 'scrape_attempted' },
        });
        failed++;
      }
    } catch (e: any) {
      console.error(`  ✗ 失败: ${e.message.slice(0, 100)}`);
      failed++;
    }

    // 请求间隔
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. 再爬 3 篇缺图片的文章（已有全文，再试一次抓图）
  console.log(`\n=== 补抓图片 ===`);
  const noImages = await prisma.$queryRaw`
    SELECT i.id, i.titleEn, i.url, i.contentFull
    FROM Item i
    WHERE i.isRelevant = 1
      AND i.contentFull IS NOT NULL
      AND (i.images IS NULL OR i.images = '' OR i.images = '[]')
      AND i.sourceId NOT LIKE 'wx_%'
    LIMIT 3
  ` as any[];

  for (const item of noImages) {
    console.log(`\n[图片] ${(item.titleEn as string).substring(0, 50)}`);
    try {
      const result = await scrapeArticle(item.url);
      if (result?.images && result.images.length > 0) {
        await prisma.item.update({
          where: { id: item.id as string },
          data: { images: JSON.stringify(result.images) },
        });
        console.log(`  ✓ 补抓 ${result.images.length} 张图片`);
      } else {
        console.log(`  ⚠ 仍无图片`);
      }
    } catch (e: any) {
      console.error(`  ✗ ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== 完成: ${scraped} 篇成功, ${failed} 篇失败 ===`);

  // 3. 导出
  console.log('\n重新导出...');
  const { execSync } = await import('child_process');
  execSync('npx tsx scripts/export-static.ts', { cwd: process.cwd(), stdio: 'inherit' });

  await closeBrowser().catch(() => {});
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect().catch(() => {}));
