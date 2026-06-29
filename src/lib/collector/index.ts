import { db } from '../db';
import { getActiveSources } from '../sources';
import { fetchRss, RawItem } from './rss';
import { relevanceFilter, dedupByTitle } from './filter';

/**
 * 采集所有信源的新闻
 */
export async function collectAll(): Promise<{ collected: number; filtered: number }> {
  const sources = getActiveSources();
  let totalCollected = 0;
  let totalFiltered = 0;

  for (const source of sources) {
    try {
      console.log(`[Collect] Fetching ${source.name}...`);

      // 1. RSS 采集
      const rawItems = await fetchRss(source);
      totalCollected += rawItems.length;

      // 2. 关键词过滤
      const filteredItems = relevanceFilter(rawItems, source);
      totalFiltered += filteredItems.length;

      // 3. 去重
      const uniqueItems = dedupByTitle(filteredItems);

      // 4. 存入数据库（URL去重）
      for (const item of uniqueItems) {
        try {
          await db.item.upsert({
            where: { url: item.url },
            update: {},
            create: {
              sourceId: source.id,
              titleEn: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
              contentHtml: item.contentHtml,
              species: source.defaultSubcategory,
              techTags: '',
              isRelevant: true,
            },
          });
        } catch (error) {
          // URL 已存在，跳过
        }
      }

      // 5. 更新信源最后采集时间
      await db.source.update({
        where: { id: source.id },
        data: { lastFetched: new Date() },
      });

      console.log(`[Collect] ${source.name}: ${rawItems.length} raw → ${uniqueItems.length} saved`);
    } catch (error) {
      console.error(`[Collect] Error processing ${source.name}:`, error);
    }
  }

  return { collected: totalCollected, filtered: totalFiltered };
}
