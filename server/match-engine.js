// match-engine.js — per-slide background matching over the analysed library.
//
// The analyser (scripts/analyse-library.mjs) records WHAT each image is; this module decides
// WHICH image carries a given slide line. Deliberately split: observation was paid for once,
// policy below is code and free to re-tune.
//
// A slide gets its deck one of two ways:
//   pool slots  (hook / trust / product) → the brand's persona pools, rotated per post so
//                consecutive posts don't open on the same face.
//   body slots  → cosine over the embedded library + policy bonuses, cross-folder by design.
// Zero dependencies. Everything loads lazily and stays in memory (~20MB).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIDDEN_SETS } from './library-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

// ── policy: tune freely, costs nothing ─────────────────────────────────────────────────────
const DECK_SIZE = 12;
const MAX_PER_FOLDER = 4;          // keep a deck cross-folder — the example1 look, not one theme
const BRAND_FIT_BONUS = { high: 0.05, medium: 0, low: -0.05 };
const FLAG_PENALTY = { 'religious-text': -0.06, alcohol: -0.06, 'skin-exposure': -0.04, 'visible-brand-logos': -0.03, medical: -0.03, gambling: -0.08, weapons: -0.1 };
const HARD_EXCLUDE_FLAGS = new Set(['nsfw-adjacent', 'children']);
const PHONE_CANDID_BONUS = 0.02;   // realness reads as credibility on TikTok
const NO_OVERLAY_ZONE_PENALTY = 0.08;
const CROWD_PENALTY = -0.06;       // 2+ people reads social/romantic — these formats speak as one voice

let lib = null;          // [{ record, vector }]
const slideVecs = new Map();
const poolCache = new Map();

// Called after an image is deleted from the library so the next match reloads the
// pruned index instead of recommending a file that is gone.
export function invalidateLibrary() {
  lib = null;
}

// ── operator uploads (brands/<brand>/media.json) ──────────────────────────────────────────
// Media an operator uploaded and aimed at specific slides ("bad skin → slide 2, product →
// slide 5"). On those slides the upload leads the deck — it is the one image the scraped
// library can never supply, so it outranks every match.
const mediaCache = new Map();

export function invalidateBrandMedia(brand) {
  mediaCache.delete(brand);
}

function brandMedia(brand) {
  if (!mediaCache.has(brand)) {
    let items = [];
    try {
      const manifest = JSON.parse(readFileSync(path.join(ROOT, 'brands', brand, 'media.json'), 'utf8'));
      if (Array.isArray(manifest.items)) items = manifest.items;
    } catch { /* brand has no uploads */ }
    mediaCache.set(brand, items);
  }
  return mediaCache.get(brand);
}

function mediaCandidatesFor(brand, slideNumber) {
  return brandMedia(brand)
    .filter((item) => Array.isArray(item.slides) && item.slides.includes(slideNumber))
    .map((item) => ({
      file: `media/${item.file}`,
      url: `/media-images/${encodeURIComponent(brand)}/${encodeURIComponent(item.file)}`,
      why: item.label ? `your upload: ${item.label}` : 'your upload, aimed at this slide',
      uploaded: true,
    }));
}

const sha1 = (text) => createHash('sha1').update(text).digest('hex');

function loadLibrary() {
  if (lib) return lib;
  const byFile = new Map();
  for (const line of readFileSync(path.join(DATA, 'library-embeddings.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const { file, v } = JSON.parse(line); byFile.set(file, v); } catch { /* truncated tail */ }
  }
  lib = [];
  for (const line of readFileSync(path.join(DATA, 'library-index.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    const vector = byFile.get(record.file);
    if (!vector) continue;
    if (HIDDEN_SETS.has(record.theme_folder)) continue;             // curated out, not deleted
    if (record.quality?.usable === false) continue;
    if (record.people?.faces_visible) continue;                       // no strangers' faces, ever
    if (!['none', 'incidental-scene'].includes(record.existing_text?.level)) continue;
    if ((record.content_flags || []).some((f) => HARD_EXCLUDE_FLAGS.has(f))) continue;
    lib.push({ record, vector });
  }
  const slidePath = path.join(DATA, 'slide-embeddings.json');
  if (existsSync(slidePath)) {
    for (const [key, v] of Object.entries(JSON.parse(readFileSync(slidePath, 'utf8')))) slideVecs.set(key, v);
  }
  return lib;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Fallback for lines with no precomputed vector and no API key: token overlap on the indexed text.
function lexicalScore(text, record) {
  const tokens = new Set(text.toLowerCase().match(/[a-z]{3,}/g) || []);
  if (!tokens.size) return 0;
  const hay = `${record.caption} ${(record.subjects || []).join(' ')} ${(record.themes || []).join(' ')} ${(record.usage?.great_for || []).join(' ')}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (hay.includes(t)) hits += 1;
  return hits / tokens.size;
}

async function embedLive(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small', input: text.slice(0, 300) }),
  });
  if (!res.ok) return null;
  const vec = (await res.json()).data?.[0]?.embedding || null;
  if (vec) slideVecs.set(sha1(text), vec);                            // session cache for re-swipes
  return vec;
}

function whyMatched(text, record) {
  const tokens = new Set(text.toLowerCase().match(/[a-z]{4,}/g) || []);
  const hit = [...(record.subjects || []), ...(record.themes || [])]
    .filter((s) => [...tokens].some((t) => s.toLowerCase().includes(t)))
    .slice(0, 2);
  return hit.length ? `matched: ${hit.join(', ')}` : (record.usage?.great_for?.[0] || record.setting || '');
}

function candidate(entry, score, text) {
  const { record } = entry;
  return {
    file: record.file,
    url: `/library-images/${record.file.split('/').map(encodeURIComponent).join('/')}`,
    score: Math.round(score * 1000) / 1000,
    bestZone: record.overlay?.best_zone || 'center',
    brightness: record.palette?.brightness,
    warmth: record.palette?.warmth,
    folder: record.theme_folder,
    why: whyMatched(text, record),
  };
}

// A theme folder that exists on disk but isn't in the paid index yet — serve the set in file
// order and say so honestly, instead of pretending it's ranked.
function unrankedTheme(theme) {
  const dir = path.join(ROOT, 'scraped-images', theme);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 24);
  } catch { /* unknown folder */ }
  return {
    source: 'library',
    mode: 'unranked',
    candidates: files.map((f) => ({
      file: `${theme}/${f}`,
      url: `/library-images/${encodeURIComponent(theme)}/${encodeURIComponent(f)}`,
      folder: theme,
      why: 'theme not indexed yet — set order',
    })),
  };
}

export async function matchLine({ brand = 'kokoro', text, theme = null }) {
  let entries = loadLibrary();
  if (theme && HIDDEN_SETS.has(theme)) return { source: 'library', mode: 'hidden', candidates: [] };
  if (theme) {
    // constrained swap: same semantic ranking, one visual world. Fastlane does this step
    // with random picks — the ranking inside the theme is the entire difference.
    entries = entries.filter((e) => e.record.theme_folder === theme);
    if (!entries.length) return unrankedTheme(theme);
  }
  let vec = slideVecs.get(sha1(text)) || null;
  if (!vec) vec = await embedLive(text);

  const scored = [];
  for (const entry of entries) {
    const { record } = entry;
    let score = vec ? cosine(vec, entry.vector) : lexicalScore(text, record);
    score += BRAND_FIT_BONUS[record.usage?.brand_fit?.[brand]] || 0;
    for (const flag of record.content_flags || []) score += FLAG_PENALTY[flag] || 0;
    if (record.authenticity === 'phone-candid') score += PHONE_CANDID_BONUS;
    if ((record.overlay?.best_zone || 'none') === 'none') score -= NO_OVERLAY_ZONE_PENALTY;
    if ((record.people?.count || 0) >= 2) score += CROWD_PENALTY;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const deck = [];
  const perFolder = new Map();
  const deckSize = theme ? 24 : DECK_SIZE;    // inside one theme, show more of it
  for (const { entry, score } of scored) {
    const folder = entry.record.theme_folder;
    if (!theme) {
      if ((perFolder.get(folder) || 0) >= MAX_PER_FOLDER) continue;
      perFolder.set(folder, (perFolder.get(folder) || 0) + 1);
    }
    deck.push(candidate(entry, score, text));
    if (deck.length >= deckSize) break;
  }
  return { source: 'library', mode: vec ? 'semantic' : 'lexical', candidates: deck };
}

function poolDeck(brand, pool, rotateBy) {
  const cacheKey = `${brand}/${pool}`;
  if (!poolCache.has(cacheKey)) {
    const dir = path.join(ROOT, 'brands', brand, 'pools', pool);
    let files = [];
    try { files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort(); } catch { /* pool absent */ }
    poolCache.set(cacheKey, files);
  }
  const files = poolCache.get(cacheKey);
  if (!files.length) return { source: `pool:${pool}`, candidates: [] };
  const shift = ((rotateBy % files.length) + files.length) % files.length;
  const rotated = [...files.slice(shift), ...files.slice(0, shift)];
  return {
    source: `pool:${pool}`,
    candidates: rotated.map((f) => ({
      file: `${pool}/${f}`,
      url: `/pool-images/${encodeURIComponent(brand)}/${encodeURIComponent(pool)}/${encodeURIComponent(f)}`,
    })),
  };
}

// Fixed slot → pool wiring. Roles come from campaign.json (ingest-sheet.mjs). Pools that a brand
// doesn't have simply return empty and the UI falls back to the library deck for that slot.
const ROLE_POOLS = { hook: 'alice-lifestyle', trust: 'alice-crying', product: 'product-phone' };

export async function matchPost({ brand = 'kokoro', post }) {
  const slides = [];
  const seenTopPicks = new Set();
  const leadFolders = new Map();      // folder → how many earlier slides it already fronts
  for (const slide of post.slides) {
    const uploads = mediaCandidatesFor(brand, slide.n);
    const pool = ROLE_POOLS[slide.role];
    if (pool) {
      const deck = poolDeck(brand, pool, (post.id || 1) - 1);
      deck.candidates = [...uploads, ...deck.candidates];
      slides.push({ n: slide.n, role: slide.role, text: slide.text, ...deck });
      continue;
    }
    const deck = await matchLine({ brand, text: slide.text });
    deck.candidates = [...uploads, ...deck.candidates];
    deck.candidates = deck.candidates.filter((c) => !seenTopPicks.has(c.file));
    // Variety is part of the format: example1 runs girl → cup → treadmill → bed, never four
    // shots from one world. If this deck's leader comes from a folder that already fronts an
    // earlier slide, promote the best candidate from a fresh folder instead (deck keeps both).
    if (deck.candidates.length > 1 && !deck.candidates[0].uploaded && leadFolders.has(deck.candidates[0].folder)) {
      const fresh = deck.candidates.findIndex((c) => !c.uploaded && !leadFolders.has(c.folder));
      if (fresh > 0) deck.candidates.unshift(deck.candidates.splice(fresh, 1)[0]);
    }
    const top = deck.candidates[0];
    if (top) {
      seenTopPicks.add(top.file);
      if (top.folder) leadFolders.set(top.folder, (leadFolders.get(top.folder) || 0) + 1);
    }
    slides.push({ n: slide.n, role: slide.role, text: slide.text, ...deck });
  }
  return { brand, postId: post.id, slides };
}
