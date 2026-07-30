// server.js — serves the Content Factory site AND the /api/* endpoints the frontend calls.
// Zero dependencies (Node 18+ built-ins only) so Railway deploy is a one-liner.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHooks, gradeHook, modelInfo, structuredModelOptions } from './hook-engine.js';
import { extractCompany, regenerateAudience } from './company-engine.js';
import { carouselModelOptions, generateCarousels } from './carousel-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'output', 'factory-mockup');
const IMAGE_LIBRARY = path.join(ROOT, 'scraped-images');
const PORT = process.env.PORT || 3000;
const MODEL_ENDPOINTS = new Set(['/api/company/extract', '/api/company/audience', '/api/carousels', '/api/hooks', '/api/hooks/grade']);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 30;
const MAX_ACTIVE_MODEL_REQUESTS = 4;
const rateBuckets = new Map();
let activeModelRequests = 0;

function clientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 120);
}

function allowModelRequest(req, res) {
  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  const key = clientAddress(req);
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (bucket.count >= RATE_LIMIT) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    sendJson(res, 429, { error: 'Generation limit reached. Wait a few minutes, then try again.' });
    return false;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return true;
}

async function withModelSlot(task) {
  if (activeModelRequests >= MAX_ACTIVE_MODEL_REQUESTS) {
    const error = new Error('The generator is busy. Try again in a moment.');
    error.statusCode = 503;
    throw error;
  }
  activeModelRequests += 1;
  try { return await task(); }
  finally { activeModelRequests -= 1; }
}

function labelFromSetId(id) {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ── tiny .env loader (no dotenv dep) ────────────────────────────────────────────────────
(function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function imageLibrary() {
  let directories = [];
  try {
    directories = (await readdir(IMAGE_LIBRARY, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const sets = await Promise.all(directories.map(async (id) => {
    const setPath = path.join(IMAGE_LIBRARY, id);
    let files = [];
    let label = labelFromSetId(id);
    try {
      files = (await readdir(setPath))
        .filter((file) => /\.jpe?g$/i.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const manifest = JSON.parse(await readFile(path.join(setPath, 'sources.json'), 'utf8'));
      if (typeof manifest.set === 'string' && manifest.set.trim()) label = manifest.set.trim();
    } catch {
      // A missing set should not take the builder offline. The UI shows the available sets.
    }
    return {
      id,
      label,
      note: `${files.length} curated source images`,
      count: files.length,
      images: files.map((file) => ({
        id: `${id}/${file}`,
        url: `/library-images/${encodeURIComponent(id)}/${encodeURIComponent(file)}`,
      })),
    };
  }));

  return sets
    .filter((set) => set.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function serveImageLibrary(req, res) {
  let rawPath;
  try { rawPath = decodeURIComponent(req.url.split('?')[0].replace(/^\/library-images\//, '')); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('bad request'); }
  const filePath = path.resolve(IMAGE_LIBRARY, rawPath);
  if (!filePath.startsWith(`${IMAGE_LIBRARY}${path.sep}`)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    let tooLarge = false;
    const declared = Number(req.headers['content-length']) || 0;
    if (declared > 1e6) {
      const error = new Error('body too large'); error.statusCode = 413;
      req.resume(); reject(error); return;
    }
    req.on('data', (c) => {
      if (tooLarge) return;
      size += c.length;
      if (size > 1e6) {
        tooLarge = true; data = '';
        const error = new Error('body too large'); error.statusCode = 413;
        reject(error); return;
      }
      data += c;
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('bad request'); }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(SITE, path.normalize(urlPath));
  if (filePath !== SITE && !filePath.startsWith(`${SITE}${path.sep}`)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ── API ──
  if (url === '/api/image-library') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
    return sendJson(res, 200, { sets: await imageLibrary() });
  }

  if (url.startsWith('/api/')) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (MODEL_ENDPOINTS.has(url) && !allowModelRequest(req, res)) return;
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJson(res, e.statusCode || 400, { error: e.message }); }

    try {
      if (url === '/api/company/extract') {
        if (!body.url) return sendJson(res, 400, { error: 'Add a company website URL.' });
        const company = await withModelSlot(() => extractCompany({ url: body.url, context: body.context || '' }));
        return sendJson(res, 200, { company });
      }
      if (url === '/api/company/audience') {
        const audience = await withModelSlot(() => regenerateAudience({
          url: body.url || '',
          context: body.context || '',
          company: body.company || null,
        }));
        return sendJson(res, 200, { audience });
      }
      if (url === '/api/carousels') {
        const themes = (await imageLibrary()).map(({ id, label }) => ({ id, label }));
        const carousels = await withModelSlot(() => generateCarousels({
          brief: body.brief || {},
          liked: Array.isArray(body.liked) ? body.liked : [],
          disliked: Array.isArray(body.disliked) ? body.disliked : [],
          themes,
          count: body.count,
        }));
        return sendJson(res, 200, { carousels });
      }
      if (url === '/api/hooks') {
        const hooks = await withModelSlot(() => generateHooks({
          brief: body.brief || {},
          topic: body.topic || '',
          seeds: Array.isArray(body.seeds) ? body.seeds : [],
          liked: Array.isArray(body.liked) ? body.liked : [],
          disliked: Array.isArray(body.disliked) ? body.disliked : [],
          count: Math.min(Number(body.count) || 6, 8),
        }));
        return sendJson(res, 200, { hooks });
      }
      if (url === '/api/hooks/grade') {
        if (!body.hook) return sendJson(res, 400, { error: 'no hook to grade' });
        const result = await withModelSlot(() => gradeHook({ brief: body.brief || {}, hook: body.hook }));
        return sendJson(res, 200, result);
      }
      return sendJson(res, 404, { error: 'unknown endpoint' });
    } catch (e) {
      console.error('[api]', url, e.message);
      const status = Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode <= 599 ? e.statusCode : 500;
      return sendJson(res, status, { error: e.message || 'server error' });
    }
  }

  // ── static site ──
  if (url.startsWith('/library-images/')) return serveImageLibrary(req, res);

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  const m = modelInfo();
  const carouselModel = carouselModelOptions();
  console.log(`Content Factory running → http://localhost:${PORT}`);
  console.log(`Hook engine: provider=${m.provider} model=${m.model}`);
  console.log(`Carousel engine: provider=${carouselModel.provider || m.provider} model=${carouselModel.model || m.model}`);
  // Brand + audience extraction must land on a current Claude model. Surface a bad config at
  // boot instead of letting the first user of the Studio discover it.
  try {
    const structured = structuredModelOptions();
    console.log(`Brand/audience engine: provider=${structured.provider} model=${structured.model}`);
  } catch (error) {
    console.error(`Brand/audience engine: NOT CONFIGURED — ${error.message}`);
  }
  console.log(`OpenAI key (images only): ${m.openaiKey ? 'present' : 'MISSING'}`);
});
