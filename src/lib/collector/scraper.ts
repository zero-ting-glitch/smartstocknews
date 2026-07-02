/**
 * Web 爬虫模块：爬取完整文章页面和列表页
 * 使用 cheerio 解析 HTML，403 时回退到 Playwright headless browser
 */
import * as cheerio from 'cheerio';
import * as dns from 'dns';
import * as net from 'net';
import { chromium } from 'playwright-extra';
import type { Browser } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT = 15000;
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};
const MAX_CONTENT_LENGTH = 10000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

// ========== Headless Browser（403 回退） ==========

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function fetchWithBrowser(url: string): Promise<string | null> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 等 Cloudflare challenge 自动通过（通常 5-10 秒）
    await page.waitForTimeout(5000);
    const html = await page.content();
    return html;
  } catch (e: any) {
    console.error(`  [browser] ${url}: ${e.message}`);
    return null;
  } finally {
    await context.close();
  }
}

/**
 * 用浏览器获取 RSS XML 原始内容（CF 拦截的 RSS 源回退）
 * 拦截最终（非重定向）HTTP 响应，获取原始 XML
 */
export async function fetchWithBrowserRss(url: string): Promise<string | null> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  try {
    // 收集所有响应，等页面加载完后取最终的 XML 响应
    const responses: Array<{ url: string; status: number; body: () => Promise<Buffer> }> = [];
    page.on('response', (resp) => {
      responses.push({ url: resp.url(), status: resp.status(), body: () => resp.body() });
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // 从后往前找第一个 200 的响应（跳过重定向）
    for (let i = responses.length - 1; i >= 0; i--) {
      const resp = responses[i];
      if (resp.status >= 200 && resp.status < 300) {
        try {
          const buf = await resp.body();
          return buf.toString('utf-8');
        } catch { continue; }
      }
    }
    return null;
  } catch (e: any) {
    console.error(`  [browser-rss] ${url}: ${e.message}`);
    return null;
  } finally {
    await context.close();
  }
}

// ========== SSRF 防护 ==========

// 主机名级别拦截（hostname 字符串匹配）
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^\[::1\]$/,
  /^::1$/,
  // IPv4 私有/保留段
  /^127\./,            // loopback
  /^10\./,             // Class A 私有
  /^172\.(1[6-9]|2\d|3[01])\./,  // Class B 私有
  /^192\.168\./,       // Class C 私有
  /^0\./,              // 当前网络
  /^169\.254\./,       // link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|1[2][0-7])\./,  // CGNAT (100.64.0.0/10)
  /^198\.1[89]\./,     // benchmarking (198.18.0.0/15)
  /^192\.0\.0\./,      // IETF protocol assignments
  /^192\.0\.2\./,      // documentation TEST-NET-1
  /^198\.51\.100\./,   // documentation TEST-NET-2
  /^203\.0\.113\./,    // documentation TEST-NET-3
  /^233\.252\.0\./,    // documentation
];

// 解析后 IP 级别拦截（比 hostname 匹配更可靠，防 DNS rebinding）
function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (ip.startsWith('::ffff:')) {
      const ipv4 = ip.slice(7);
      return isPrivateIp(ipv4);
    }
    const first = parseInt(ip.split(':')[0], 16);
    if (first >= 0xfe80 && first <= 0xfebf) return true;
    if (first >= 0xfc00 && first <= 0xfdff) return true;
    if (first >= 0xff00) return true;
    return false;
  }
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    if (parts[0] >= 224) return true;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    return false;
  }
  return false;
}

async function resolveAndValidateHost(hostname: string): Promise<boolean> {
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    return !isPrivateIp(hostname);
  }
  try {
    const result = await dns.promises.resolve4(hostname);
    const addresses: string[] = typeof result === 'string' ? [result] : Array.isArray(result) ? result as string[] : [];
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        console.error(`  [ssrf] DNS resolved to private IP: ${hostname} → ${addr}`);
        return false;
      }
    }
    return true;
  } catch {
    try {
      const result6 = await dns.promises.resolve6(hostname);
      const addresses6: string[] = typeof result6 === 'string' ? [result6] : Array.isArray(result6) ? result6 as string[] : [];
      for (const addr of addresses6) {
        if (isPrivateIp(addr)) {
          console.error(`  [ssrf] DNS resolved to private IP: ${hostname} → ${addr}`);
          return false;
        }
      }
      return true;
    } catch {
      // DNS 解析失败（如 DNS 服务器不可用），放行让 fetch 自行处理
      // isSafeUrl 已经校验了 URL 格式和私有 IP 模式，足够防 SSRF
      return true;
    }
  }
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    if (BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) return false;
    if (/^\d+$/.test(hostname) || /^0[xX][0-9a-fA-F]+$/.test(hostname) || /^0\d+$/.test(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
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

function parseArticleHtml(html: string, url: string, config?: string): ScrapeResult | null {
  const $ = cheerio.load(html);
  const scrapeConfig = config ? JSON.parse(config) : null;
  const title = extractTitle($, scrapeConfig);
  const { contentText, images } = extractContent($, scrapeConfig, url);
  const author = extractAuthor($, scrapeConfig);
  const publishedAt = extractDate($, scrapeConfig);
  if (!contentText || contentText.length < 50) {
    console.error(`  [scrape] 内容太短: ${url}`);
    return null;
  }
  return { title, contentText, images, author, publishedAt };
}

/**
 * 爬取单篇文章，提取全文内容、图片、作者
 * fetch 返回 403 时自动回退到 headless browser
 */
export async function scrapeArticle(
  url: string,
  config?: string
): Promise<ScrapeResult | null> {
  if (!isSafeUrl(url)) {
    console.error(`  [scrape] 非法 URL: ${url}`);
    return null;
  }

  const parsed = new URL(url);
  if (!(await resolveAndValidateHost(parsed.hostname))) {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT),
    });

    // 403 时回退到 headless browser
    if (res.status === 403) {
      console.log(`  [scrape] 403，尝试浏览器回退: ${url}`);
      const html = await fetchWithBrowser(url);
      if (html) return parseArticleHtml(html, url, config);
      return null;
    }

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
    return parseArticleHtml(html, url, config);
  } catch (e: any) {
    console.error(`  [scrape] ${url}: ${e.message}`);
    return null;
  }
}

function parseListingHtml(html: string, listUrl: string, config: string): ListingResult[] {
  const $ = cheerio.load(html);
  const scrapeConfig = JSON.parse(config);
  const selector = scrapeConfig.listingSelector || 'article a[href]';
  const results: ListingResult[] = [];
  const seen = new Set<string>();
  $(selector).each((_: number, el: any) => {
    const href = $(el).attr('href');
    if (!href) return;
    const absoluteUrl = resolveUrl(href, listUrl);
    if (!isSafeUrl(absoluteUrl)) return;
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);
    const title = $(el).text().trim() || $(el).find('h2, h3, h4').first().text().trim();
    results.push({ url: absoluteUrl, title, publishedAt: null });
  });
  return results;
}

/**
 * 爬取列表页，发现文章链接
 * fetch 返回 403 时自动回退到 headless browser
 */
export async function scrapeListingPage(
  listUrl: string,
  config: string
): Promise<ListingResult[]> {
  if (!isSafeUrl(listUrl)) {
    console.error(`  [listing] 非法 URL: ${listUrl}`);
    return [];
  }

  const parsedUrl = new URL(listUrl);
  if (!(await resolveAndValidateHost(parsedUrl.hostname))) {
    return [];
  }

  try {
    const res = await fetch(listUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT),
    });

    // 403 时回退到 headless browser
    if (res.status === 403) {
      console.log(`  [listing] 403，尝试浏览器回退: ${listUrl}`);
      const html = await fetchWithBrowser(listUrl);
      if (html) {
        const results = parseListingHtml(html, listUrl, config);
        console.log(`  [listing] ${listUrl}: 发现 ${results.length} 篇文章`);
        return results;
      }
      return [];
    }

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
    const results = parseListingHtml(html, listUrl, config);
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
      '.article-content',
      '.article-page',
      '.post-body',
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

  // 提取图片（只保留 http/https）
  const images: string[] = [];
  const imgSelector = config?.imageSelector || 'img';
  contentEl.find(imgSelector).each((_: number, el: any) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !src.includes('avatar') && !src.includes('icon') && !src.includes('logo')) {
      const imgUrl = resolveUrl(src, baseUrl);
      if (isSafeHref(imgUrl)) {
        images.push(imgUrl);
      }
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
