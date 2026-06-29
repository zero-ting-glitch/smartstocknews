/**
 * Web 爬虫模块：爬取完整文章页面和列表页
 * 使用 cheerio 解析 HTML，无需浏览器
 */
import * as cheerio from 'cheerio';

const UA = 'SmartStock/1.0 (Smart Agriculture News Aggregator; +https://github.com/zero-ting-glitch/smartstocknews)';
const TIMEOUT = 15000;
const MAX_CONTENT_LENGTH = 10000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

// SSRF 防护：只允许 http/https，阻止私有 IP
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^localhost$/i,
  /^\[::1\]$/,
];

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return false;
    return true;
  } catch {
    return false;
  }
}

export interface ScrapeResult {
  title: string;
  contentText: string;
  images: string[];
  author: string | null;
  publishedAt: Date | null;
}

export interface ListingResult {
  url: string;
  title: string;
  publishedAt: Date | null;
}

/**
 * 爬取单篇文章，提取全文内容、图片、作者
 */
export async function scrapeArticle(
  url: string,
  config?: string
): Promise<ScrapeResult | null> {
  if (!isValidUrl(url)) {
    console.error(`  [scrape] 非法 URL: ${url}`);
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!res.ok) {
      console.error(`  [scrape] ${res.status} ${url}`);
      return null;
    }

    // 检查响应大小
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_BYTES) {
      console.error(`  [scrape] 响应太大: ${url} (${contentLength} bytes)`);
      return null;
    }

    const html = await res.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      console.error(`  [scrape] 响应体太大: ${url} (${html.length} bytes)`);
      return null;
    }
    const $ = cheerio.load(html);
    const scrapeConfig = config ? JSON.parse(config) : null;

    // 提取标题
    const title = extractTitle($, scrapeConfig);

    // 提取文章内容
    const { contentText, images } = extractContent($, scrapeConfig, url);

    // 提取作者
    const author = extractAuthor($, scrapeConfig);

    // 提取日期
    const publishedAt = extractDate($, scrapeConfig);

    if (!contentText || contentText.length < 50) {
      console.error(`  [scrape] 内容太短: ${url}`);
      return null;
    }

    return { title, contentText, images, author, publishedAt };
  } catch (e: any) {
    console.error(`  [scrape] ${url}: ${e.message}`);
    return null;
  }
}

/**
 * 爬取列表页，发现文章链接
 */
export async function scrapeListingPage(
  listUrl: string,
  config: string
): Promise<ListingResult[]> {
  if (!isValidUrl(listUrl)) {
    console.error(`  [listing] 非法 URL: ${listUrl}`);
    return [];
  }

  try {
    const res = await fetch(listUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!res.ok) {
      console.error(`  [listing] ${res.status} ${listUrl}`);
      return [];
    }

    // 检查响应大小
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_BYTES) {
      console.error(`  [listing] 响应太大: ${listUrl}`);
      return [];
    }

    const html = await res.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      console.error(`  [listing] 响应体太大: ${listUrl}`);
      return [];
    }
    const $ = cheerio.load(html);
    const scrapeConfig = JSON.parse(config);
    const selector = scrapeConfig.listingSelector || 'article a[href]';

    const results: ListingResult[] = [];
    const seen = new Set<string>();

    $(selector).each((_: number, el: any) => {
      const href = $(el).attr('href');
      if (!href) return;

      const absoluteUrl = resolveUrl(href, listUrl);
      if (!isValidUrl(absoluteUrl)) return;
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      const title = $(el).text().trim() || $(el).find('h2, h3, h4').first().text().trim();
      results.push({ url: absoluteUrl, title, publishedAt: null });
    });

    console.log(`  [listing] ${listUrl}: 发现 ${results.length} 篇文章`);
    return results;
  } catch (e: any) {
    console.error(`  [listing] ${listUrl}: ${e.message}`);
    return [];
  }
}

// ========== 内部函数 ==========

function extractTitle($: cheerio.CheerioAPI, config: any): string {
  // 优先使用配置的选择器
  if (config?.titleSelector) {
    const text = $(config.titleSelector).first().text().trim();
    if (text) return text;
  }

  // 回退到常见模式
  return (
    $('h1.entry-title').first().text().trim() ||
    $('h1.post-title').first().text().trim() ||
    $('h1.article-title').first().text().trim() ||
    $('article h1').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim()
  );
}

function extractContent(
  $: cheerio.CheerioAPI,
  config: any,
  baseUrl: string
): { contentText: string; images: string[] } {
  let contentEl: any;

  // 优先使用配置的选择器
  if (config?.contentSelector) {
    contentEl = $(config.contentSelector).first();
  } else {
    // 按优先级尝试常见选择器
    const selectors = [
      'article .entry-content',
      'article .post-content',
      '.article-body',
      '.story-body',
      '.entry-content',
      '.post-content',
      'article',
      'main',
    ];

    contentEl = $(selectors[0]);
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        contentEl = el;
        break;
      }
    }
  }

  // 提取纯文本
  // 移除 script、style、nav、footer、aside
  contentEl.find('script, style, nav, footer, aside, .sidebar, .ad, .advertisement').remove();
  const contentText = contentEl.text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);

  // 提取图片
  const images: string[] = [];
  const imgSelector = config?.imageSelector || 'img';
  contentEl.find(imgSelector).each((_: number, el: any) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !src.includes('avatar') && !src.includes('icon') && !src.includes('logo')) {
      images.push(resolveUrl(src, baseUrl));
    }
  });

  return { contentText, images: images.slice(0, 10) };
}

function extractAuthor($: cheerio.CheerioAPI, config: any): string | null {
  if (config?.authorSelector) {
    const text = $(config.authorSelector).first().text().trim();
    if (text) return text;
  }

  // 常见作者选择器
  const selectors = [
    '.author-name',
    '.byline a',
    '.post-author',
    'meta[name="author"]',
    '[rel="author"]',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.attr('content') || el.text().trim();
      if (text) return text;
    }
  }

  return null;
}

function extractDate($: cheerio.CheerioAPI, config: any): Date | null {
  if (config?.dateSelector) {
    const el = $(config.dateSelector).first();
    const datetime = el.attr('datetime') || el.text().trim();
    if (datetime) {
      const d = new Date(datetime);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 常见日期选择器
  const selectors = [
    'time[datetime]',
    '.post-date',
    '.article-date',
    'meta[property="article:published_time"]',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const datetime = el.attr('datetime') || el.attr('content') || el.text().trim();
      if (datetime) {
        const d = new Date(datetime);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  return null;
}

function resolveUrl(href: string, base: string): string {
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}
