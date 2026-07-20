// Generate Kokoro carousel slide-1 covers with gpt-image-2 (medium quality = draft tier).
// Reads OPENAI_API_KEY from repo .env. Writes 1024x1536 PNGs -> ../assets/
// Run: node generate.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", "..", "..", ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const KEY = env.OPENAI_API_KEY;
if (!KEY) { console.error("No OPENAI_API_KEY in .env"); process.exit(1); }

const OUT = join(here, "..", "assets");
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Vertical 2:3 social carousel cover. Japanese minimalist aesthetic: soft dusk light, warm muted tones, gentle film grain, calm and intimate mood. Elegant thin serif typography rendered directly in the image, lowercase, warm cream-white text, generous letter spacing, centered, easy to read. No watermarks, no logos, no UI chrome, no borders. Spell the text EXACTLY as given and add no other words.";

const SLIDES = [
  ["for everyone who held it together all day",
   "a woman sitting alone by a rain-streaked window at dusk, warm lamplight, soft shadows, seen from behind, quiet",
   "cover-held-it-together"],
  ["signs you're the strong one (not okay)",
   "an empty warm-lit room at evening, a single paper lantern glowing softly, a cup of tea gone cold on a low wooden table",
   "cover-strong-one"],
  ["you don't need advice. you need to be heard.",
   "close soft-focus of hands wrapped around a warm mug, a blurred window with soft rain behind, muted dusk palette",
   "cover-be-heard"],
  ["the magic number for a quieter mind is one",
   "a single sakura branch against a plain warm cream wall, very minimal, soft morning light, lots of negative space",
   "cover-magic-number"],
  ["your brain wasn't built for 9 hours of screens",
   "a quiet forest path in soft green light, mist between trees, calm and grounding, early morning",
   "cover-nature-brain"],
  ["things nobody tells you about being tired",
   "a softly lit bedroom at dusk, unmade warm bedding, a small lantern, gentle shadows, peaceful and honest",
   "cover-being-tired"],
];

async function gen([hook, scene, file]) {
  const prompt = `${STYLE} Scene: ${scene}. The only text in the image, spelled exactly: "${hook}"`;
  process.stdout.write(`→ ${file} … `);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1536", quality: "medium", n: 1 }),
  });
  const json = await res.json();
  if (!res.ok || !json.data?.[0]?.b64_json) {
    console.log(`✗ ${json.error?.message || res.status}`);
    return false;
  }
  writeFileSync(join(OUT, `${file}.png`), Buffer.from(json.data[0].b64_json, "base64"));
  console.log("✓");
  return true;
}

let ok = 0;
for (const s of SLIDES) {
  try { if (await gen(s)) ok++; }
  catch (e) { console.log(`✗ ${e.message}`); }
}
console.log(`\nDone: ${ok}/${SLIDES.length} covers → ${OUT}`);
