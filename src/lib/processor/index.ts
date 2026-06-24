import { db } from '../db';
import { getSourceById } from '../sources';
import { scoreItem } from './scorer';
import { translateItem } from './translator';
import { calculateQualityScore, isFeatured, isHot } from './calculator';

/**
 * 处理待评分的条目（三阶段处理）
 */
export async function processItems(): Promise<{ processed: number; featured: number }> {
  // 获取未处理的条目（没有AI分数的）
  const items = await db.item.findMany({
    where: {
      aiScores: null,
      isRelevant: true,
    },
    include: { source: true },
    take: 50, // 每次处理50条
  });

  let processed = 0;
  let featured = 0;

  for (const item of items) {
    try {
      // Stage 2a: AI 评分（并行）
      const scores = await scoreItem(item.titleEn, item.contentHtml || undefined);

      // Stage 2b: 翻译（与评分并行，但这里串行以简化）
      const translation = await translateItem(item.titleEn, item.contentHtml || undefined);

      // Stage 3: 代码计算最终分
      const qualityScore = calculateQualityScore(
        scores,
        item.source.tier,
        item.multiSourceCount
      );

      // 判断是否精选/热点
      const featured_ = isFeatured(qualityScore, item.source.tier);
      const hot = isHot(qualityScore, item.multiSourceCount);

      // 更新数据库
      await db.item.update({
        where: { id: item.id },
        data: {
          aiScores: JSON.stringify(scores),
          titleZh: translation.titleZh,
          summaryZh: translation.summaryZh,
          qualityScore,
          isHot: hot,
        },
      });

      processed++;
      if (featured_) featured++;

      console.log(`[Process] ${item.titleEn.slice(0, 50)}... → score: ${qualityScore}`);
    } catch (error) {
      console.error(`[Process] Error processing item ${item.id}:`, error);
    }
  }

  return { processed, featured };
}
