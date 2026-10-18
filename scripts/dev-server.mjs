// Local preview of the portfolio: serves the static files and runs
// api/contact.js the way Vercel does. Zero dependencies.
//
//   node scripts/dev-server.mjs [port]
//
// Without RESEND_API_KEY in the environment the form runs in dry-run mode:
// the email is printed here and nothing is sent.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 4180);
if (!process.env.RESEND_API_KEY) process.env.CONTACT_DRY_RUN = '1';
const contact = createRequire(import.meta.url)(path.join(root, 'api', 'contact.js'));

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.json': 'application/json', '.mp4': 'video/mp4',
};

// Minimal Vercel-style res helpers so the handler runs unchanged.
function vercelRes(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
    return res;
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/contact') return contact(req, vercelRes(res));

    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end('Forbidden'); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
}).listen(port, () => {
    console.log(`Portfolio preview on http://localhost:${port}` + (process.env.CONTACT_DRY_RUN === '1' ? ' (form in dry-run mode)' : ''));
});
