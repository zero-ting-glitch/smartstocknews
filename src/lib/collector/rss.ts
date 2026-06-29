import Parser from 'rss-parser';
import { SourceConfig } from '../sources';

export interface RawItem {
  title: string;
  url: string;
  publishedAt: Date;
  contentHtml?: string;
  sourceId: string;
}

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'SmartStock/1.0 (+https://smartstock.vercel.app)',
  },
});

/**
 * 从 RSS 源采集新闻
 */
export async function fetchRss(source: SourceConfig): Promise<RawItem[]> {
  if (!source.rssUrl) return [];
  try {
    const feed = await parser.parseURL(source.rssUrl);

    return (feed.items || []).map(item => ({
      title: item.title || '',
      url: item.link || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      contentHtml: item.content || item.contentSnippet || '',
      sourceId: source.id,
    })).filter(item => item.title && item.url);
  } catch (error) {
    console.error(`[RSS] Failed to fetch ${source.name}:`, error);
    return [];
  }
}
