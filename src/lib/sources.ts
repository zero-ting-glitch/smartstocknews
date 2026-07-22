import { readFileSync } from 'fs';
import { join } from 'path';

export interface SourceConfig {
  id: string;
  name: string;
  nameZh: string;
  url: string;
  rssUrl: string | null;
  tier: 'T1' | 'T1.5' | 'T2';
  type: string;
  defaultCategory: string;
  defaultSubcategory: string;
  scrapeType?: string;
  listUrl?: string;
  scrapeConfig?: string;
  /**
   * 是否跳过全文爬取（2026-07-21 新增）
   * 用于微信公众号等"只要标题不要正文"的源：入库时直接标记 scrapedAt，Step 3 跳过
   */
  skipContentScrape?: boolean;
  coreKeywords: string;
  excludeKeywords: string;
}

export interface SourcesConfig {
  sources: SourceConfig[];
  contentFarmBlacklist: string[];
  tiers: Record<string, { weight: number; label: string }>;
}

let cachedConfig: SourcesConfig | null = null;

/**
 * 加载信源配置
 */
export function loadSources(): SourcesConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(process.cwd(), 'data', 'sources.json');
  const raw = readFileSync(configPath, 'utf-8');
  const config: SourcesConfig = JSON.parse(raw);
  cachedConfig = config;
  return config;
}

/**
 * 获取所有活跃信源
 */
export function getActiveSources(): SourceConfig[] {
  const config = loadSources();
  return config.sources;
}

/**
 * 根据ID获取信源
 */
export function getSourceById(id: string): SourceConfig | undefined {
  const config = loadSources();
  return config.sources.find(s => s.id === id);
}

/**
 * 获取内容农场黑名单
 */
export function getContentFarmBlacklist(): string[] {
  const config = loadSources();
  return config.contentFarmBlacklist;
}

/**
 * 获取信源等级权重
 */
export function getTierWeight(tier: string): number {
  const config = loadSources();
  return config.tiers[tier]?.weight ?? 0.4;
}
