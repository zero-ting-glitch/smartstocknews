/**
 * AI 五维评分接口
 */
export interface AIScores {
  relevance: number;     // 相关性：与智慧畜牧的关联度 (0-100)
  importance: number;    // 重要性：对行业的影响程度 (0-100)
  novelty: number;       // 新颖性：是否是新东西 (0-100)
  readability: number;   // 可读性：内容质量 (0-100)
  actionability: number; // 可操作性：能否指导实践 (0-100)
}

/**
 * 精选阈值（不同信源等级）
 */
const THRESHOLDS: Record<string, number> = {
  'T1': 60,    // 官方一手，60分就值得看
  'T1.5': 70,  // 行业权威，70分
  'T2': 80,    // 综合媒体，80分才精选
};

/**
 * 信源等级权重
 */
const TIER_WEIGHTS: Record<string, number> = {
  'T1': 1.0,
  'T1.5': 0.7,
  'T2': 0.4,
};

/**
 * 计算最终质量分（纯代码，不用AI）
 */
export function calculateQualityScore(
  aiScores: AIScores,
  sourceTier: string,
  multiSourceCount: number = 1
): number {
  // 1. AI五维均分
  const aiAvg = (
    aiScores.relevance +
    aiScores.importance +
    aiScores.novelty +
    aiScores.readability +
    aiScores.actionability
  ) / 5;

  // 2. 信源权重
  const tierWeight = TIER_WEIGHTS[sourceTier] ?? 0.4;

  // 3. 多源验证加分（同一事件被N个信源报道）
  const multiSourceBonus = 1 + 0.2 * Math.min(multiSourceCount - 1, 3);

  // 4. 最终质量分
  return Math.round(aiAvg * tierWeight * multiSourceBonus * 10) / 10;
}

/**
 * 判断是否入选精选
 */
export function isFeatured(qualityScore: number, sourceTier: string): boolean {
  const threshold = THRESHOLDS[sourceTier] ?? 80;
  return qualityScore >= threshold;
}

/**
 * 判断是否入选今日热点
 */
export function isHot(qualityScore: number, multiSourceCount: number): boolean {
  return qualityScore >= 75 || multiSourceCount >= 3;
}
