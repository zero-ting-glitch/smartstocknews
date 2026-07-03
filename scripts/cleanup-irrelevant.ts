/**
 * 一次性清理：对所有现有文章做 AI 语义筛选，标记不相关的为 ai_rejected
 *
 * 用法: npx tsx scripts/cleanup-irrelevant.ts
 *
 * 注意：此脚本不会删除数据，只标记 isRelevant=false + techTags='ai_rejected'
 * 标记后需重新导出（跑管线 Step 5 或 export-static.ts）才能从前端消失
 *
 * 费用估算：~200 tokens/篇 × 当前文章数 ≈ 几分钱
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function callDeepSeek(prompt: string, maxTokens = 200): Promise<string> {
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

async function screeningEvaluate(titleEn: string, content?: string): Promise<boolean> {
  const snippet = content ? content.slice(0, 1500) : '';
  const prompt = `判断这篇新闻是否与智慧农业或智慧畜牧相关。

相关：IoT、AI、自动化、机器人、计算机视觉、无人机、传感器、精准农业、精准畜牧、智慧农业、数字农业、农业科技在种植/养殖中的应用。

不相关：普通农业新闻、市场价格/商品、不带技术视角的疾病爆发、不含技术的政策法规、食品加工/零售、供应链物流、消费趋势、不含技术视角的可持续发展/ESG 报告。

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

async function main() {
  console.log('=== 现有文章 AI 语义清理 ===\n');
  const startTime = Date.now();

  // 获取所有当前标记为相关的文章
  const items = await prisma.item.findMany({
    where: { isRelevant: true },
    select: { id: true, titleEn: true, contentFull: true, contentHtml: true },
  });

  console.log(`待筛选: ${items.length} 篇\n`);

  let passed = 0;
  let rejected = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const content = item.contentFull || item.contentHtml || '';
    const progress = `[${i + 1}/${items.length}]`;

    try {
      const shouldInclude = await screeningEvaluate(item.titleEn, content);

      if (!shouldInclude) {
        await prisma.item.update({
          where: { id: item.id },
          data: { isRelevant: false, techTags: 'ai_rejected' },
        });
        rejected++;
        console.log(`  ${progress} ✗ 拒稿: ${item.titleEn.slice(0, 50)}`);
      } else {
        passed++;
        console.log(`  ${progress} ✓ 通过: ${item.titleEn.slice(0, 50)}`);
      }
    } catch (e: any) {
      failed++;
      console.error(`  ${progress} ✗ 失败: ${item.titleEn.slice(0, 50)}: ${e.message}`);
    }

    // 每 10 篇输出一次小结，防止看花眼
    if ((i + 1) % 10 === 0 || i === items.length - 1) {
      console.log(`  → 进度: ${passed} 通过, ${rejected} 拒稿, ${failed} 失败\n`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`=== 清理完成 (${elapsed}s) ===`);
  console.log(`  总计: ${items.length} 篇`);
  console.log(`  通过: ${passed} 篇（保留）`);
  console.log(`  拒稿: ${rejected} 篇（标记 ai_rejected）`);
  console.log(`  失败: ${failed} 篇（未处理，默认通过）`);
  console.log(`\n请重新导出以更新前端：npx tsx scripts/export-static.ts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
