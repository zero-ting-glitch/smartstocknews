import { SourceConfig, getContentFarmBlacklist } from '../sources';
import { RawItem } from './rss';

/**
 * 相关性过滤 + 内容农场过滤
 * 第一层：关键词匹配（纯代码，极快）
 */
export function relevanceFilter(items: RawItem[], source: SourceConfig): RawItem[] {
  const blacklist = getContentFarmBlacklist();
  const keywords = source.relevanceFilter.split('|').map(k => k.toLowerCase());

  return items.filter(item => {
    const titleLower = item.title.toLowerCase();

    // 1. 内容农场黑名单过滤
    if (blacklist.some(word => titleLower.includes(word.toLowerCase()))) {
      return false;
    }

    // 2. 相关性关键词匹配
    const isRelevant = keywords.some(keyword => titleLower.includes(keyword));
    if (!isRelevant) {
      return false;
    }

    return true;
  });
}

/**
 * 标题相似度去重（简单实现）
 */
export function dedupByTitle(items: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>();

  for (const item of items) {
    const normalizedTitle = normalizeTitle(item.title);
    const existing = seen.get(normalizedTitle);

    if (!existing) {
      seen.set(normalizedTitle, item);
    }
  }

  return Array.from(seen.values());
}

/**
 * 标题标准化（用于去重比较）
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]/g, '') // 只保留字母数字和中文
    .slice(0, 50); // 取前50字符比较
}
