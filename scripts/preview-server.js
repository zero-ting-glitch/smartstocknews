/**
 * SmartStock 本地静态预览服务器（零依赖，仅用 Node 内置模块）
 *
 * 作用：把 out/ 目录（与 GitHub Pages 完全同一份成品）按线上相同的路径结构
 * 提供在 http://localhost:8080/smartstocknews/ 下，所见即线上。
 *
 * 用法：双击项目根目录的「预览网站.bat」即可；关闭弹出的黑色窗口即停止。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BASE = '/smartstocknews';
const ROOT = path.join(__dirname, '..', 'out');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json',
};

function resolveFile(urlPath) {
  // 去掉 basePath 前缀，落到 out/ 目录内，防目录穿越
  let rel = decodeURIComponent(urlPath.slice(BASE.length)) || '/';
  const candidates = [];
  if (rel.endsWith('/')) {
    candidates.push(rel + 'index.html');
  } else if (path.extname(rel)) {
    candidates.push(rel);
  } else {
    candidates.push(rel + '.html', rel + '/index.html');
  }
  for (const c of candidates) {
    const abs = path.normalize(path.join(ROOT, c));
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return abs;
    }
  }
  // 兜底：out/ 自带的 404 页
  const notFound = path.join(ROOT, '404.html');
  return fs.existsSync(notFound) ? notFound : null;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  // 裸根路径 → 跳到带前缀的首页（和线上体验一致）
  if (urlPath === '/' || urlPath === '') {
    res.writeHead(302, { Location: BASE + '/' });
    res.end();
    return;
  }
  if (!urlPath.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE + urlPath });
    res.end();
    return;
  }

  const file = resolveFile(urlPath);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache', // 重新 build 后刷新即见最新
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log('SmartStock 预览已启动（内容与线上一致）');
  console.log('地址: http://localhost:' + PORT + BASE + '/');
  console.log('关闭本窗口即停止预览。');
});
