// server.js — serves the Content Factory site AND the /api/* endpoints the frontend calls.
// Zero dependencies (Node 18+ built-ins only) so Railway deploy is a one-liner.
import http from 'node:http';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHooks, gradeHook, modelInfo, structuredModelOptions } from './hook-engine.js';
import { extractCompany, regenerateAudience } from './company-engine.js';
import { carouselModelOptions, generateCarousels } from './carousel-engine.js';
import { invalidateBrandMedia, invalidateLibrary, matchLine, matchPost } from './match-engine.js';
import { HIDDEN_SETS } from './library-config.js';
import { regenerateStorySlide } from './story-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'output', 'factory-mockup');
const IMAGE_LIBRARY = path.join(ROOT, 'scraped-images');
const PORT = process.env.PORT || 3000;
const MODEL_ENDPOINTS = new Set([
  '/api/company/extract',
  '/api/company/audience',
  '/api/carousels',
  '/api/hooks',
  '/api/hooks/grade',
  '/api/stories/generate',
  '/api/stories/slide',
  '/api/images/generate',
]);
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
      .map((entry) => entry.name)
      .filter((name) => !HIDDEN_SETS.has(name));
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

// Permanently remove one image from the scraped library: the file itself, its
// sources.json entry, and its records in the analysed index — so the matcher never
// recommends a ghost and every other image keeps its own description. On Railway the
// filesystem is ephemeral, so a cloud delete lasts until the next deploy; durable
// removal happens by deleting locally and committing, which this same code path
// performs on Dan's machine.
async function deleteLibraryImage(file) {
  const clean = String(file || '');
  if (!/^[a-z0-9-]{1,50}\/[a-z0-9._-]+\.jpe?g$/i.test(clean)) {
    const error = new Error('bad image path'); error.statusCode = 400; throw error;
  }
  const [setId, filename] = clean.split('/');
  const filePath = path.resolve(IMAGE_LIBRARY, setId, filename);
  if (!filePath.startsWith(`${IMAGE_LIBRARY}${path.sep}`)) {
    const error = new Error('forbidden'); error.statusCode = 403; throw error;
  }
  if (!existsSync(filePath)) {
    const error = new Error('image not found'); error.statusCode = 404; throw error;
  }
  await unlink(filePath);

  // sources.json keeps a per-file record — drop only this file's entry.
  const manifestPath = path.join(IMAGE_LIBRARY, setId, 'sources.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (Array.isArray(manifest.images)) {
      manifest.images = manifest.images.filter((entry) => entry?.filename !== filename);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } catch { /* a set without a manifest is fine */ }

  // The analysed index + embeddings are keyed by "set/file" — drop matching lines only.
  for (const dataFile of ['library-index.jsonl', 'library-embeddings.jsonl']) {
    const dataPath = path.join(ROOT, 'data', dataFile);
    if (!existsSync(dataPath)) continue;
    const kept = (await readFile(dataPath, 'utf8')).split('\n').filter((line) => {
      if (!line.trim()) return false;
      try { return JSON.parse(line).file !== clean; } catch { return false; }
    });
    const tmp = `${dataPath}.tmp`;
    await writeFile(tmp, `${kept.join('\n')}\n`);
    await rename(tmp, dataPath);
  }
  invalidateLibrary();
  return { deleted: clean };
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

// brand slug → its campaign + profile, path-safe. Brand is always caller data, never a constant.
function brandDir(slug) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug || '')) return null;
  const dir = path.join(ROOT, 'brands', slug);
  return existsSync(dir) ? dir : null;
}

async function servePoolImage(req, res) {
  // /pool-images/<brand>/<pool>/<file> → brands/<brand>/pools/<pool>/<file> (derivatives only;
  // _originals is gitignored and deliberately unreachable from here)
  let raw;
  try { raw = decodeURIComponent(req.url.split('?')[0].replace(/^\/pool-images\//, '')); }
  catch { res.writeHead(400); return res.end('bad request'); }
  const [brand, pool, file] = raw.split('/');
  const dir = brandDir(brand);
  if (!dir || !pool || !file || pool.startsWith('_')) { res.writeHead(404); return res.end('not found'); }
  const filePath = path.resolve(dir, 'pools', pool, file);
  if (!filePath.startsWith(path.resolve(dir, 'pools') + path.sep) || !/\.jpe?g$/i.test(filePath)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

// ── brand media: operator-uploaded images (product shots, before/afters) with slide targets ──
// Stored in brands/<brand>/media/ + media.json manifest. These are the images the scraped
// library can never provide — "bad skin on slide 2, the product on slide 5" — so the matcher
// fronts them on their target slides and the editor offers them on every slide.
const MEDIA_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']) || 0;
    if (declared > maxBytes) {
      const error = new Error('file too large (8MB max)'); error.statusCode = 413;
      req.resume(); reject(error); return;
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        const error = new Error('file too large (8MB max)'); error.statusCode = 413;
        reject(error); return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function cleanSlideTargets(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const slides = [...new Set(list.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))];
  return slides.sort((a, b) => a - b).slice(0, 12);
}

async function readMediaManifest(dir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'media.json'), 'utf8'));
    return Array.isArray(manifest.items) ? manifest.items : [];
  } catch { return []; }
}

async function writeMediaManifest(dir, items) {
  const file = path.join(dir, 'media.json');
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify({ items }, null, 2));
  await rename(tmp, file);
}

function mediaResponse(brand, items) {
  return items.map((item) => ({
    ...item,
    url: `/media-images/${encodeURIComponent(brand)}/${encodeURIComponent(item.file)}`,
  }));
}

async function serveMediaImage(req, res) {
  let raw;
  try { raw = decodeURIComponent(req.url.split('?')[0].replace(/^\/media-images\//, '')); }
  catch { res.writeHead(400); return res.end('bad request'); }
  const [brand, file, ...extra] = raw.split('/');
  const dir = brandDir(brand);
  if (!dir || !file || extra.length || !/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(file)) {
    res.writeHead(404); return res.end('not found');
  }
  try {
    const buf = await readFile(path.resolve(dir, 'media', file));
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

async function uploadMedia(req, res) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const brand = params.get('brand') || 'kokoro';
  const dir = brandDir(brand);
  if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = MEDIA_EXT[type];
  if (!ext) return sendJson(res, 415, { error: 'Upload a JPEG, PNG, or WEBP image.' });
  let body;
  try { body = await readRawBody(req, MEDIA_MAX_BYTES); }
  catch (e) { return sendJson(res, e.statusCode || 400, { error: e.message }); }
  if (!body.length) return sendJson(res, 400, { error: 'empty upload' });
  const label = String(params.get('label') || '').slice(0, 120);
  const slides = cleanSlideTargets(params.get('slides'));
  const file = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  await mkdir(path.join(dir, 'media'), { recursive: true });
  await writeFile(path.join(dir, 'media', file), body);
  const items = await readMediaManifest(dir);
  items.push({ file, label, slides, addedAt: new Date().toISOString() });
  await writeMediaManifest(dir, items);
  invalidateBrandMedia(brand);
  return sendJson(res, 200, { item: mediaResponse(brand, items).at(-1) });
}

function safeSlug(value, fallback = 'draft') {
  const slug = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug || fallback;
}

function resolvePoolReference(dir, brand, rawUrl) {
  let decoded;
  try { decoded = decodeURIComponent(String(rawUrl || '').split('?')[0]); } catch { return null; }
  const prefix = `/pool-images/${brand}/`;
  if (!decoded.startsWith(prefix)) return null;
  const [pool, file, ...extra] = decoded.slice(prefix.length).split('/');
  if (extra.length || !/^[a-z0-9-]{1,50}$/.test(pool || '') || !/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(file || '')) return null;
  const candidate = path.resolve(dir, 'pools', pool, file);
  const root = path.resolve(dir, 'pools') + path.sep;
  return candidate.startsWith(root) && existsSync(candidate) ? candidate : null;
}

async function listInfluencers(dir, brand) {
  const profileDir = path.join(dir, 'influencers');
  let profileFiles = [];
  try { profileFiles = (await readdir(profileDir)).filter((file) => file.endsWith('.json')); } catch { /* optional */ }
  const profiles = [];
  for (const file of profileFiles) {
    try { profiles.push(JSON.parse(await readFile(path.join(profileDir, file), 'utf8'))); } catch { /* ignore malformed drafts */ }
  }
  const generated = {};
  let poolEntries = [];
  try { poolEntries = await readdir(path.join(dir, 'pools'), { withFileTypes: true }); } catch { /* optional */ }
  for (const entry of poolEntries) {
    if (!entry.isDirectory() || !entry.name.endsWith('-generated')) continue;
    const files = (await readdir(path.join(dir, 'pools', entry.name)))
      .filter((file) => /\.jpe?g$/i.test(file))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    generated[entry.name] = files.map((file) => `/pool-images/${brand}/${entry.name}/${file}`);
  }
  return { profiles, generated };
}

async function generateInfluencerImage({ dir, brand, prompt, personaSlug, references }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured on this server.');
    error.statusCode = 503;
    throw error;
  }
  const cleanPrompt = String(prompt || '').trim().slice(0, 3500);
  if (cleanPrompt.length < 30) {
    const error = new Error('Add a more specific image prompt.');
    error.statusCode = 400;
    throw error;
  }
  const referenceFiles = (Array.isArray(references) ? references : [])
    .slice(0, 4)
    .map((item) => resolvePoolReference(dir, brand, item))
    .filter(Boolean);
  const headers = { Authorization: `Bearer ${apiKey}` };
  let response;
  if (referenceFiles.length) {
    const form = new FormData();
    form.set('model', 'gpt-image-2');
    form.set('prompt', cleanPrompt);
    form.set('size', '1024x1536');
    form.set('quality', 'medium');
    form.set('output_format', 'jpeg');
    form.set('output_compression', '88');
    for (const file of referenceFiles) {
      form.append('image[]', new Blob([await readFile(file)], { type: 'image/jpeg' }), path.basename(file));
    }
    response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: form });
  } else {
    response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: cleanPrompt,
        size: '1024x1536',
        quality: 'medium',
        output_format: 'jpeg',
        output_compression: 88,
      }),
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Image generation failed (${response.status}).`);
    error.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) {
    const error = new Error('The image model returned no draft.');
    error.statusCode = 502;
    throw error;
  }
  const pool = `${safeSlug(personaSlug, 'influencer')}-generated`;
  const targetDir = path.join(dir, 'pools', pool);
  await mkdir(targetDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  await writeFile(path.join(targetDir, filename), Buffer.from(base64, 'base64'));
  return {
    url: `/pool-images/${brand}/${pool}/${filename}`,
    pool,
    model: 'gpt-image-2',
    quality: 'medium',
    usedReferences: referenceFiles.length,
  };
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ── API ──
  if (url === '/api/image-library') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
    return sendJson(res, 200, { sets: await imageLibrary() });
  }

  if (url === '/api/media') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const brand = params.get('brand') || 'kokoro';
    const dir = brandDir(brand);
    if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
    return sendJson(res, 200, { items: mediaResponse(brand, await readMediaManifest(dir)) });
  }

  if (url === '/api/media/upload') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    try { return await uploadMedia(req, res); }
    catch (e) {
      console.error('[api]', url, e.message);
      return sendJson(res, e.statusCode || 500, { error: e.message || 'upload failed' });
    }
  }

  if (url === '/api/influencers') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const brand = params.get('brand') || 'kokoro';
    const dir = brandDir(brand);
    if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
    return sendJson(res, 200, await listInfluencers(dir, brand));
  }

  if (url === '/api/campaign') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const dir = brandDir(params.get('brand') || 'kokoro');
    if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
    try {
      const campaign = JSON.parse(await readFile(path.join(dir, 'campaign.json'), 'utf8'));
      return sendJson(res, 200, { campaign });
    } catch {
      return sendJson(res, 404, { error: 'this brand has no campaign yet' });
    }
  }

  if (url === '/api/brands' && req.method === 'GET') {
    // tenant roster for the UI switchers — the directories under brands/ ARE the list,
    // so a new tenant appears everywhere by dropping a folder, never by editing UI code.
    const base = path.join(ROOT, 'brands');
    let entries = [];
    try { entries = (await readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory()); } catch { /* no brands yet */ }
    const brands = [];
    for (const e of entries) {
      try {
        const profile = JSON.parse(await readFile(path.join(base, e.name, 'profile.json'), 'utf8'));
        brands.push({
          key: e.name,
          name: profile.name || e.name,
          logo: profile.logo || '',
          status: profile.status || 'confirmed',
          hasCampaign: existsSync(path.join(base, e.name, 'campaign.json')),
        });
      } catch { /* a brand dir without a profile is not a tenant yet */ }
    }
    // Working tenants first (campaign live), then the rest alphabetically — never a
    // hardcoded brand order.
    brands.sort((a, b) => Number(b.hasCampaign) - Number(a.hasCampaign) || a.name.localeCompare(b.name));
    return sendJson(res, 200, { brands });
  }

  if (url === '/api/brand' && req.method === 'GET') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const dir = brandDir(params.get('brand') || 'kokoro');
    if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
    try { return sendJson(res, 200, { company: JSON.parse(await readFile(path.join(dir, 'profile.json'), 'utf8')) }); }
    catch { return sendJson(res, 404, { error: 'no profile for this brand' }); }
  }

  if (url === '/api/picks' && req.method === 'GET') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const dir = brandDir(params.get('brand') || 'kokoro');
    if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
    try { return sendJson(res, 200, { picks: JSON.parse(await readFile(path.join(dir, 'picks.json'), 'utf8')) }); }
    catch { return sendJson(res, 200, { picks: { posts: {} } }); }
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
      if (url === '/api/stories/generate') {
        const dir = brandDir(body.brand || 'kokoro');
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const profile = JSON.parse(await readFile(path.join(dir, 'profile.json'), 'utf8'));
        const pain = String(body.pain || '').trim().slice(0, 120);
        const angle = String(body.angle || '').trim().slice(0, 120);
        const direction = String(body.direction || '').trim().slice(0, 600);
        const context = [
          profile.context || '',
          pain ? `The operator selected this audience pain: ${pain}.` : '',
          angle ? `The operator selected this story angle: ${angle}.` : '',
          direction ? `Additional operator direction: ${direction}.` : '',
        ].filter(Boolean).join('\n');
        const brief = {
          ...profile,
          context,
          audience_intel: pain ? {
            ...(profile.audience_intel || {}),
            pains: [{ label: pain, pinned: true }],
          } : profile.audience_intel,
        };
        const themes = (await imageLibrary()).map(({ id, label }) => ({ id, label }));
        const stories = await withModelSlot(() => generateCarousels({
          brief,
          liked: Array.isArray(body.liked) ? body.liked : [],
          disliked: Array.isArray(body.disliked) ? body.disliked : [],
          themes,
          count: Math.min(Number(body.count) || 3, 4),
        }));
        return sendJson(res, 200, { stories });
      }
      if (url === '/api/stories/slide') {
        const dir = brandDir(body.brand || 'kokoro');
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const profile = JSON.parse(await readFile(path.join(dir, 'profile.json'), 'utf8'));
        const result = await withModelSlot(() => regenerateStorySlide({
          brief: profile,
          story: body.story,
          slideNumber: body.slideNumber,
          direction: body.direction,
        }));
        return sendJson(res, 200, result);
      }
      if (url === '/api/images/generate') {
        const brand = safeSlug(body.brand || 'kokoro', 'kokoro');
        const dir = brandDir(brand);
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const result = await withModelSlot(() => generateInfluencerImage({
          dir,
          brand,
          prompt: body.prompt,
          personaSlug: body.personaSlug,
          references: body.references,
        }));
        return sendJson(res, 200, result);
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
      if (url === '/api/picks') {
        // the swipe room's bank: which background (and text position) won each slide of a post.
        // Stored next to the campaign so the tenant's whole month travels as one directory.
        const dir = brandDir(body.brand || 'kokoro');
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const postId = Number(body.postId);
        if (!Number.isInteger(postId) || postId < 1 || postId > 999) return sendJson(res, 400, { error: 'bad postId' });
        const file = path.join(dir, 'picks.json');
        let picks = { posts: {} };
        try { picks = JSON.parse(await readFile(file, 'utf8')); picks.posts = picks.posts || {}; } catch { /* first write */ }
        if (body.reset) {
          delete picks.posts[postId];
        } else {
          const slides = {};
          for (const [n, s] of Object.entries(body.slides || {})) {
            const slot = Number(n);
            if (!Number.isInteger(slot) || slot < 1 || slot > 12 || !s || typeof s !== 'object') continue;
            const entry = { file: String(s.file || '').slice(0, 200), url: String(s.url || '').slice(0, 300) };
            const t = Number(s.ty);
            if (Number.isFinite(t)) entry.ty = Math.max(5, Math.min(85, Math.round(t * 10) / 10));
            const fs = Number(s.fs);
            if (Number.isFinite(fs)) entry.fs = Math.max(10, Math.min(34, Math.round(fs)));
            if (typeof s.text === 'string' && s.text.trim() && s.text.length <= 300) entry.text = s.text;
            // v2: free text objects — position, size, weight, colors, outline, pill background
            if (Array.isArray(s.texts)) {
              const clamp = (v, min, max, dflt) => { const x = Number(v); return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : dflt; };
              const hex = (v) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? String(v) : null);
              const texts = s.texts.slice(0, 6).map((tb) => (tb && typeof tb === 'object' ? {
                t: String(tb.t || '').slice(0, 300),
                x: Math.round(clamp(tb.x, 2, 98, 50) * 10) / 10,
                y: Math.round(clamp(tb.y, 2, 96, 38) * 10) / 10,
                fs: Math.round(clamp(tb.fs, 8, 40, 17)),
                fw: Math.round(clamp(tb.fw, 300, 900, 550)),
                sw: Math.round(clamp(tb.sw, 0, 0.4, 0.15) * 100) / 100,
                width: Math.round(clamp(tb.width, 24, 96, 88) * 10) / 10,
                font: ['TikTok Sans', 'Arial', 'Georgia', 'Courier New'].includes(tb.font) ? tb.font : 'TikTok Sans',
                color: hex(tb.color) || '#ffffff',
                sc: hex(tb.sc) || '#000000',
                bg: ['none', 'white', 'black'].includes(tb.bg) ? tb.bg : 'none',
                bgColor: hex(tb.bgColor) || '#ffffff',
              } : null)).filter((tb) => tb && tb.t.trim());
              if (texts.length) entry.texts = texts;
            }
            slides[slot] = entry;
          }
          const aspect = ['1:1', '4:5', '3:4', '9:16'].includes(body.aspect) ? body.aspect : '9:16';
          picks.posts[postId] = { done: Boolean(body.done), aspect, slides, updatedAt: new Date().toISOString() };
        }
        const tmp = `${file}.tmp`;
        await writeFile(tmp, JSON.stringify(picks, null, 2));
        await rename(tmp, file);
        return sendJson(res, 200, { ok: true, done: Object.values(picks.posts).filter((p) => p && p.done).length });
      }
      if (url === '/api/library/delete') {
        return sendJson(res, 200, await deleteLibraryImage(body.file));
      }
      if (url === '/api/media/update') {
        const brand = body.brand || 'kokoro';
        const dir = brandDir(brand);
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const items = await readMediaManifest(dir);
        const item = items.find((entry) => entry.file === String(body.file || ''));
        if (!item) return sendJson(res, 404, { error: 'media not found' });
        if ('label' in body) item.label = String(body.label || '').slice(0, 120);
        if ('slides' in body) item.slides = cleanSlideTargets(body.slides);
        await writeMediaManifest(dir, items);
        invalidateBrandMedia(brand);
        return sendJson(res, 200, { item: mediaResponse(brand, [item])[0] });
      }
      if (url === '/api/media/delete') {
        const brand = body.brand || 'kokoro';
        const dir = brandDir(brand);
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        const file = String(body.file || '');
        if (!/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(file)) return sendJson(res, 400, { error: 'bad file' });
        const items = await readMediaManifest(dir);
        if (!items.some((entry) => entry.file === file)) return sendJson(res, 404, { error: 'media not found' });
        await writeMediaManifest(dir, items.filter((entry) => entry.file !== file));
        try { await unlink(path.resolve(dir, 'media', file)); } catch { /* manifest already pruned */ }
        invalidateBrandMedia(brand);
        return sendJson(res, 200, { deleted: file });
      }
      if (url === '/api/brands/create') {
        // the Home search becomes a tenant: whatever the operator extracted and edited is
        // saved as brands/<slug>/profile.json and appears in every switcher on next load.
        const company = body.company;
        if (!company || typeof company !== 'object' || !String(company.name || '').trim()) {
          return sendJson(res, 400, { error: 'Run the company search first — there is nothing to save yet.' });
        }
        const key = safeSlug(body.key || company.name, '');
        if (!key) return sendJson(res, 400, { error: 'This company name cannot become a workspace id.' });
        if (brandDir(key)) return sendJson(res, 409, { error: `Workspace "${key}" already exists.` });
        const dir = path.join(ROOT, 'brands', key);
        const profile = { ...company, status: 'draft' };
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
        return sendJson(res, 200, { key, name: company.name });
      }
      if (url === '/api/match/slide') {
        // one line, one deck — used by the editor's theme swap. Ranked inside the theme when the
        // index covers it; honest set-order fallback when it doesn't.
        if (!brandDir(body.brand || 'kokoro')) return sendJson(res, 404, { error: 'unknown brand' });
        const text = String(body.text || '').slice(0, 300);
        if (!text.trim()) return sendJson(res, 400, { error: 'no slide text' });
        let theme = null;
        if (body.theme) {
          theme = String(body.theme);
          if (!/^[a-z0-9-]{1,50}$/.test(theme)) return sendJson(res, 400, { error: 'bad theme' });
        }
        return sendJson(res, 200, await matchLine({ brand: body.brand || 'kokoro', text, theme }));
      }
      if (url === '/api/match') {
        // embeddings are ~1000x cheaper than the chat endpoints and mostly precomputed, so this
        // sits outside the model rate bucket — swiping must never hit "generator is busy".
        const dir = brandDir(body.brand || 'kokoro');
        if (!dir) return sendJson(res, 404, { error: 'unknown brand' });
        let post = body.post;
        if (!post && body.postId) {
          const campaign = JSON.parse(await readFile(path.join(dir, 'campaign.json'), 'utf8'));
          post = campaign.posts.find((p) => p.id === Number(body.postId));
        }
        if (!post || !Array.isArray(post.slides)) return sendJson(res, 400, { error: 'pass postId or a post with slides' });
        if (post.slides.length > 12) return sendJson(res, 400, { error: 'too many slides' });
        for (const s of post.slides) s.text = String(s.text || '').slice(0, 300);
        return sendJson(res, 200, await matchPost({ brand: body.brand || 'kokoro', post }));
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
  if (url.startsWith('/pool-images/')) return servePoolImage(req, res);
  if (url.startsWith('/media-images/')) return serveMediaImage(req, res);

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
