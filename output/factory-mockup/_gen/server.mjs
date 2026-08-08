// Local dev server for the Content Factory mockup.
// - serves the static site (index.html + assets)
// - exposes the LIVE "clone viral slides" pipeline so the browser never sees the API key:
//     POST /api/clone/scan     { example }                      -> ordered structural analysis
//     POST /api/clone/adapt    { analysis, company }            -> adapted carousel spec
//     POST /api/clone/generate { bg, aesthetic }               -> one background image (saved, url returned)
// Key is read from repo .env and stays in this process only.
//
// Run:  node _gen/server.mjs      then open http://localhost:5178
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");                 // output/factory-mockup
const REPO = join(here, "..", "..", "..");     // repo root
const EXAMPLES = join(REPO, "examples");
const GENDIR = join(ROOT, "assets", "gen");    // where generated bg's land
const PORT = 5178;

const env = Object.fromEntries(
  readFileSync(join(REPO, ".env"), "utf8")
    .split("\n").filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const KEY = env.OPENAI_API_KEY;
if (!KEY) { console.error("No OPENAI_API_KEY in .env"); process.exit(1); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };
const imgMime = (f) => MIME[extname(f).toLowerCase()] || "image/jpeg";

async function openai(path, body) {
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `OpenAI ${res.status}`);
  return json;
}

// ---- pipeline steps -------------------------------------------------------
async function scan(exampleDir) {
  const files = readdirSync(exampleDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const content = [{ type: "text", text:
`Analyze the slides of ONE viral TikTok photo carousel (images given in arbitrary order). Each slide has a small "N / M"
page counter near the top-right — USE IT to order slides. Return STRICT JSON:
{"total":M,"topic":"...","hook":"...","slides":[{"n":1,"onSlideText":"FULL exact text","scene":"what the photo shows","isPlug":false,"plugApp":null}...]}
Rules:
- onSlideText: transcribe the ENTIRE text on the slide, top to bottom, EXACTLY — every line, numbering, parentheses,
  and especially any sentence that mentions an app/product/tool you use (these are often lower and smaller). Do not truncate.
- isPlug=true for any slide whose text recommends or credits a specific app/product/tool (e.g. "I track mine in X",
  "I use the Y app to…"); put that name in plugApp. There is usually exactly one such slide, mid-carousel.
- Order slides ascending by n. JSON only, no prose.` }];
  for (const f of files) {
    const b64 = readFileSync(join(exampleDir, f)).toString("base64");
    content.push({ type: "image_url", image_url: { url: `data:${imgMime(f)};base64,${b64}`, detail: "high" } });
  }
  const json = await openai("chat/completions", {
    model: "gpt-4o", messages: [{ role: "user", content }],
    response_format: { type: "json_object" }, max_tokens: 2200, temperature: 0.1,
  });
  const parsed = JSON.parse(json.choices[0].message.content);
  // Fallback: if no plug was detected, mark the structurally-correct mid slide (playbook: ~tip 3 / middle).
  if (parsed.slides?.length && !parsed.slides.some((s) => s.isPlug)) {
    const mid = parsed.slides[Math.min(parsed.slides.length - 1, Math.round(parsed.slides.length / 2))];
    if (mid) { mid.isPlug = true; mid.plugInferred = true; }
  }
  return parsed;
}

async function adapt(analysis, company) {
  const sys = `You clone the STRUCTURE of a proven viral carousel onto a new brand. Keep the exact slide count, the exact
role of each slide (hook, numbered tips, the ONE mid-carousel app plug on the SAME slide index, any absurd comment-bait
tip, the closer) and the "N. claim (benefit)" phrasing. Rewrite all wording to the new brand's topic, audience and voice.
The plug slide weaves the brand app in as a personal habit inside its numbered tip (like "(I track mine in HealthMeter)"),
never as an ad. Each slide < ~16 words. Give each slide "bg" = a short background-image prompt fitting the brand aesthetic
(NO text in the image). Return STRICT JSON: {"caption":"...","slides":[{"n":1,"role":"hook","text":"...","bg":"...","isPlug":false}...]}`;
  const user = `PROVEN CAROUSEL (clone this structure):\n${JSON.stringify(analysis)}\n\nNEW BRAND:\n${JSON.stringify(company)}\n\nProduce the adapted carousel now.`;
  const json = await openai("chat/completions", {
    model: "gpt-4o", messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    response_format: { type: "json_object" }, max_tokens: 1600, temperature: 0.7,
  });
  return JSON.parse(json.choices[0].message.content);
}

async function generate(bg, aesthetic, slug) {
  const prompt = `Vertical 2:3 phone-carousel BACKGROUND photo. ${aesthetic || "natural, atmospheric, cinematic soft light"}. Scene: ${bg}. Absolutely NO text, NO words, NO letters, NO logos, NO UI. Leave the middle area calm so text can be overlaid later.`;
  const json = await openai("images/generations", { model: "gpt-image-2", prompt, size: "1024x1536", quality: "medium", n: 1 });
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  if (!existsSync(GENDIR)) mkdirSync(GENDIR, { recursive: true });
  const fname = `${slug}.png`;
  writeFileSync(join(GENDIR, fname), Buffer.from(b64, "base64"));
  return `assets/gen/${fname}`;
}

// ---- http -----------------------------------------------------------------
const readBody = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => res(d)); });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // ---- API ----
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST") { res.writeHead(405).end(); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      let out;
      if (url.pathname === "/api/clone/scan") {
        const dir = join(EXAMPLES, String(body.example || "").replace(/[^a-z0-9]/gi, ""));
        if (!existsSync(dir)) throw new Error("unknown example");
        out = await scan(dir);
      } else if (url.pathname === "/api/clone/adapt") {
        out = await adapt(body.analysis, body.company);
      } else if (url.pathname === "/api/clone/generate") {
        out = { url: await generate(body.bg, body.aesthetic, body.slug || "bg-" + (body.n || 0)) };
      } else { res.writeHead(404).end('{"error":"no route"}'); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
      return;
    }
    // ---- static ----
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log(`Content Factory  →  http://localhost:${PORT}`));
