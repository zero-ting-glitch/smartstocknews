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
 * 2026-07-21 调整：原 T1=60 过松（T1 精选率 95%），T1.5=70 过严（精选率 0%）
 * 新阈值配合导出阶段的 tier 内百分位兜底，控制整体精选率 20-30%
 */
const THRESHOLDS: Record<string, number> = {
  'T1': 75,    // 官方一手，从 60 提至 75
  'T1.5': 65,  // 行业权威，从 70 降至 65
  'T2': 80,    // 综合媒体，保持 80
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
 * tier 内精选百分位（导出阶段兜底用）
 * 同一 tier 内按 qualityScore 排序，只取前 N%
 */
export const TIER_PERCENTILE: Record<string, number> = {
  'T1': 0.40,   // T1 取前 40%
  'T1.5': 0.30, // T1.5 取前 30%
  'T2': 0.15,   // T2 取前 15%
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
 * 2026-07-21 调整：质量分 75→82（提高单源热点门槛）；
 * multiSourceCount >=3 降为 >=2（为未来跨源去重生效后留口子，多源报道即热点）
 */
export function isHot(qualityScore: number, multiSourceCount: number): boolean {
  return qualityScore >= 82 || multiSourceCount >= 2;
}
