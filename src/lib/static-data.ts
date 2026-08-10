/**
 * 静态数据读取（仅 Server Component 使用）
 *
 * 构建时把列表数据直接注入静态 HTML（SSG），让 SSR 页面自带完整文章列表。
 * 这样从详情页返回列表页时，浏览器原生滚动恢复即可一次到位，
 * 不依赖任何客户端 JS 补丁（sessionStorage / 内联脚本 / 遮罩）。
 *
 * 注意裁剪 translationZh 等大字段：Timeline 列表渲染用不到，
 * 留着只会让 RSC payload 体积翻倍（DOM 一份 + 序列化一份）。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'public', 'data');

function readJson(filename: string): any {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8'));
}

/** 裁剪为列表页（Timeline/NewsCard）所需字段 */
function slim(item: any) {
  return {
    id: item.id,
    titleEn: item.titleEn,
    titleZh: item.titleZh ?? null,
    url: item.url,
    summaryZh: item.summaryZh ?? null,
    featuredReason: item.featuredReason ?? null,
    publishedAt: item.publishedAt ?? null,
    source: item.source,
    species: item.species,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    techTags: item.techTags ?? '',
    qualityScore: item.qualityScore,
    isFeatured: item.isFeatured ?? false,
  };
}

/** 全部文章（精简字段） */
export function getItems() {
  try {
    return readJson('items.json').map(slim);
  } catch {
    return [];
  }
}

/** 精选文章（主页用，构建时过滤好，体积小） */
export function getFeaturedItems() {
  return getItems().filter((i: any) => i.isFeatured);
}

/** 按物种频道的文章 */
export function getSpeciesItems(species: string) {
  try {
    return readJson(`items-${species}.json`).map(slim);
  } catch {
    return [];
  }
}

/** 热点（右侧面板） */
export function getHotItems(species?: string) {
  try {
    return readJson(species ? `hot-items-${species}.json` : 'hot-items.json');
  } catch {
    return [];
  }
}

/** 统计数据 */
export function getStats() {
  try {
    return readJson('stats.json');
  } catch {
    return undefined;
  }
}
