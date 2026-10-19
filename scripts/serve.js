const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname === '/vocabulaire' || pathname === '/kanji' ? pathname + '.html' : pathname));
  if (!target.startsWith(root + path.sep) || !mime[path.extname(target)]) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(target, (error, bytes) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  });
}).listen(port, '127.0.0.1', () => console.log(`Nihongo N4 : http://127.0.0.1:${port}`));
