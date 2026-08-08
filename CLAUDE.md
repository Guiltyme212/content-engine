# Content Engine — project context

Read this first. It is the handoff document for any agent working in this repo.

## What this project is

**This is a multi-tenant content-generation SERVICE ("Content Factory"), NOT a Kokoro-only
tool.** It generates on-brand TikTok/IG content (carousels now, AI video later) for **any
brand**, driven by that brand's own profile. This is the thing new agents get wrong most
often — do not hardcode any single brand into the engine.

- **Kokoro is tenant #1** — Dan's own iOS app and his first real test case, not the design
  center. Dan's partner **Nazar will run the same product for completely different brands**
  (other niches, voices, aesthetics).
- **Brand identity (name, voice, audience, aesthetic, niche) is DATA, never hardcoded.** It
  comes from a per-tenant company profile captured by the Home onboarding when a user pastes
  their startup link (site → brand brief), then read by every generator. In the mockup that's
  the `window.COMPANY` object. If you're about to write "lowercase intimate" or "dusk sakura"
  as a constant in engine logic — stop; that belongs to the Kokoro tenant's profile, supplied
  at runtime.
- **Demo/sample assets should span many niches** (fitness, finance, food, skincare, plants…)
  to prove universality. Dan explicitly rejected all-Kokoro-styled demo output.

**The Kokoro tenant brief** (one example of per-brand data, scoped to that tenant — NOT a
global default): Kokoro ([kokoromind.com](https://kokoromind.com), 4.9★) — you vent by voice
after a hard day, it listens like a supportive friend, then makes a personalized 3–7 min
meditation from your own words. Audience: mostly women / "quiet humans". Voice: lowercase,
intimate, no toxic positivity ("i won't try to fix you. i'll just listen — and make you
something"). Aesthetic: Japanese minimalism (sakura, lanterns, dusk).

Roadmap: image carousels first (proven cheapest format), AI video later. A learning loop
(post → pull metrics → learn which hooks/formats win → generate better) comes after the
basics work. Currently in **test mode**: prove the pipeline on Dan's own accounts, adapting to
Kokoro as the first real brand; no TikTok monetization needed. A website will be hosted on
**Railway** (CLI v4.44 installed, repo connected to GitHub `Guiltyme212/content-engine`) —
task brief pending in `docs/website-brief.md`.


## Live demo deployment (2026-07-20)

The Content Factory demo is live at **https://content-engine-production-f818.up.railway.app/**.

- Railway project: **content-factory**; production service: **content-engine**.
- Railway production currently tracks the GitHub branch **agent/content-factory-demo-release** (commit `3de33ae`), not `main`. That branch is a safe release branch, not a separate app. After the demo, merge GitHub PR #1 and, if desired, change Railway's production branch to `main`.
- Deployment is a single dependency-free Node 18+ service. Railway uses `railway.toml` and runs `npm start`; the server listens on Railway's injected `PORT`.
- `OPENAI_API_KEY` must remain a sealed Railway variable / untracked local `.env` value. Never commit it. The Hook Lab needs it; the static dashboard can load without it.
- This is deliberately an unprotected, hard-to-discover demo URL for one or two people. Do not describe it as secure: anyone with the URL can call the Hook Lab and incur model cost. Add authentication/rate limiting before wider sharing.
- User work is intentionally browser-local: setup progress, Hook Lab topic/keepers, carousel-editor edits, and last-opened page persist in `localStorage` on the same browser/device. There is no database or cross-device account sync.
- Demo limitation: Hook Lab endpoints `/api/hooks` and `/api/hooks/grade` are live. The carousel-cloning screen references `/api/clone/*` endpoints that have not been implemented server-side, so treat that flow as a visual prototype until its backend is built.

## Repo layout

- **The company profile carries an audience layer** (added 2026-07-30): pains (label + the
  behavioural tell + the emotional cost), beliefs to break, the audience's own words, and a
  product bridge (habit / plug line / claims to avoid). Extracted from the tenant's site in
  parallel with the brand profile (`extractAudience` in `server/company-engine.js`), **edited in
  place by the operator** in the Studio's brief card, and read by every generator via
  `briefBlock()`/`editorialTopic()`. A *pinned* pain is an explicit instruction: it must survive
  a regenerate and it aims the next batch. This exists because a freelancer's 60-post sheet
  proved the pain list is the asset and the slide template is cheap — see
  `examples/analysis/example4-fixed-slot-machine.md` and body shape A4 in the playbook.
- **The scraped-images library is curated** (2026-08-08): `server/library-config.js` holds
  `HIDDEN_SETS` — folders Dan ruled off-type. They stay on disk/git but are invisible to
  `/api/image-library` and the matcher (old picks referencing them still render). Deleting is
  different from hiding: the carousel editor's thumbnail ✕ calls `/api/library/delete`, which
  removes the file, its `sources.json` entry, and its `data/*.jsonl` records (keyed by
  `set/file`, so other images' descriptions are untouched). Cloud deletes are ephemeral on
  Railway — durable removal = delete locally, prune, commit, push. `data/*.jsonl` were
  restored from skip-worktree on Dan's machine 2026-08-08 and are normal tracked files again.
- **Workspaces & brand media** (2026-08-08): three tenants live under `brands/` — kokoro,
  glowkit (seeded from its App Store listing, logo in `assets/glowkit-logo.jpg`), mangoway.
  A shared bottom-left switcher (`output/factory-mockup/account-switcher.js`, localStorage
  `cf:brand` + `?brand=`) sits on every page. `POST /api/brands/create` saves the Studio's
  extracted company as a new workspace ("Save as a workspace" button under the brief).
  Per-brand uploads live in `brands/<brand>/media/` + `media.json` (untracked runtime state,
  like `picks.json`): the `media.html` page uploads and aims each image at slide numbers, and
  `matchPost` fronts a targeted upload on those slides ahead of every library match. The
  carousel editor also grew a "Yours" tab and a paste-full-script control (one line per
  slide). Railway's filesystem is ephemeral — cloud uploads/workspaces last until the next
  deploy; local ones become durable when committed.
- `library/carousel-playbook.md` — **the copy/knowledge layer.** Format skeletons, hook bank,
  slide craft rules, visual rules — brand-agnostic craft that applies to any tenant. Per-brand
  briefs (e.g. Kokoro's) are examples/inputs, not the point. Generators write FROM this file.
  A future analyzer will scrape winning hooks/carousels and append to it (section 6).
  Production injects a short brand-agnostic excerpt (`CONTENT_FIRST_REFERENCE` in
  `server/hook-engine.js`) — keep it in sync when transferable strategy changes.
- `examples/` — the reference carousels we cloned from proven winners, photos renamed to slide
  order (`exampleN/1.jpg` = cover). `examples/analysis/` holds the slide-by-slide teardowns,
  the 8 shared conversion laws (`00-what-makes-these-convert.md`), and the generator system
  prompt (`carousel-system-prompt.md`). The playbook's §1 body shapes A1/A2/A3 come from these.
- `output/post-XXX-*/` — finished ready-to-post carousels (JPEG slides + caption.txt).
  post-001: nature-psychology test. post-002: first Kokoro post.
- `docs/website-brief.md` — template awaiting Dan's description of the website task.
- `.agents/skills/` — installed skills (frontend-design, ui-ux-pro-max, design-taste-frontend,
  vercel-react-best-practices, gsd, use-railway). Symlinked into Claude Code.

## Locked-in decisions (do not relitigate without Dan)

0. **Models: current Claude for every text call; NO legacy models, ever** (2026-07-30). Dan
   rejected `gpt-4o` outright ("it knows nothing about hooks"). Banned everywhere in the copy
   layer, including "harmless" structured-JSON side calls: `gpt-4o`, `gpt-4o-mini`, `gpt-4`,
   `gpt-4-turbo`, `gpt-3.5-*`, `o1-*`. Default `claude-opus-5`; read the `claude-api` skill for
   exact IDs instead of copying whatever a neighbouring file used. OpenAI stays for **image**
   generation only (decision 1). Today's working Claude path is Dan's OpenAI-compatible proxy
   (`MODEL_PROVIDER=proxy` + a `claude-*` `MODEL_NAME` + `PROXY_BASE_URL`/`PROXY_API_KEY`);
   there is no real `ANTHROPIC_API_KEY` in the repo — `HOOK_MODEL_KEY` is the proxy key, so it
   would 401 against api.anthropic.com. `structuredModelOptions()` in `server/hook-engine.js`
   throws rather than silently falling back to OpenAI, and the server logs the resolved
   brand/audience model at boot. Railway production already has `MODEL_PROVIDER`, `MODEL_NAME`,
   `MODEL_REASONING_EFFORT`, `PROXY_BASE_URL`, and `PROXY_API_KEY` set on the `content-engine`
   service (verified 2026-07-30), so the proxy route works there too. The proxy serves
   `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, and `claude-sonnet-4-6` — all verified
   live. **The proxy key has now been pasted in chat twice: rotate it before production.**
1. **Image generation: OpenAI `gpt-image-2`** (1024x1536 portrait). `high` quality for slides
   with text (~$0.17/img), `medium` for drafts (~$0.04). Batch API halves costs at volume.
2. **Typography: real-font OVERLAY on textless backgrounds** (REVERSED 2026-07-20). The winning
   TikTok carousels don't bake text into images — creators type it in TikTok's editor. So the
   engine now generates a **clean textless background** (gpt-image-2) and overlays **real
   TikTok Sans text** (TikTok's own editor font, self-hosted variable woff2 in
   `output/factory-mockup/fonts/`, Montserrat fallback; adopted 2026-07-24) on top — white
   fill + black outline, `paint-order:stroke fill`. All of it lives once in
   `output/factory-mockup/slide-type.css`; per-element rules keep POSITION and FONT-SIZE only
   — do not re-declare typeface/weight/tracking/leading/stroke locally or the surfaces drift
   apart again (they already did once: five surfaces had five different line-heights).
   **The exact values are measured, not taste** (2026-07-30) — headless-Chrome renders
   compared by ink mask against a native-res crop of the real cover
   (`assets/ref-example1-text.png`, whose line is 321px wide splitting 91/60/147px at the
   word spaces): `opsz` 36 pinned, `wght` 700, `letter-spacing:0`, `line-height:1.23`,
   `-webkit-text-stroke:.15em`. Two traps recorded in that file: (a) `opsz` MUST be pinned
   (`font-optical-sizing:none`) because CSS defaults to `auto`, which ties `opsz` to the
   rendered px size, so 5–28px surfaces each picked a different, looser cut — IoU by opsz:
   36 → .651, 16 → .519, 12 → .443; (b) measuring the reference's black halo suggests a
   `.21em` stroke, which is wrong — it is a downscaled JPEG and blur spreads a thin outline
   over extra dark pixels. Judge stroke on a rendered ladder. Never guess tracking from a
   screenshot; a hand-picked `-.012em` measured worse and made the line 26px too narrow.
   Verify any change on `/font-match.html`.
   This is the current builder architecture. (Earlier note said "render text
   INSIDE the image" and "Dan rejected overlay" — that was about ugly SYSTEM fonts / the GDI+
   renderer; the fix was a good web font, not baking letters. Old baked-text covers in
   `output/` are superseded.) Still demand exact spelling and review every slide.
3. **Copy comes from the playbook**, not improvised — hooks from the hook bank, structure
   from a skeleton, adapted to the loaded tenant's brand profile (not a fixed brand). Example
   skeleton (as used for the Kokoro tenant): validation ×4 → warmup → mid-carousel app plug
   (~tip 3; updated from "last slide only" per the 2026-07-20 reference analysis).
4. **Posting layer: SocialClaw preferred** (getsocialclaw.com — CLI/API/MCP, TikTok photo
   carousels up to 35 imgs, per-post analytics command; 7-day trial then from $15/mo; an API
   key alone is NOT enough, needs active plan). Alternatives researched: upload-post.com,
   Postiz. Manual posting from phone during test mode is fine and free.
5. **Platform constraints** (from research, verified against official docs mid-2026):
   TikTok photo posts: JPEG/WEBP only (no PNG), no caption line breaks, ~15 photo posts/day
   per account cap, unaudited TikTok API clients can only post SELF_ONLY (why we use an
   audited third-party). Instagram Graph API: own-account posting needs no app review;
   richest metrics (watch time, saves, reach). Warm new accounts 7–14 days; 1–3 posts/day.
   Realistic AI content must be labeled (is_aigc); never AI-fake factual proof imagery.

## Secrets

**No keys in this repo, ever.** OpenAI key lives in env vars / Railway variables / local
untracked `.env`. The key Dan used for tests (2026-07) was pasted in chat — treat as
semi-exposed, rotate before production.

## Working agreements

- Dan says "don't build anything" often — respect it. Research/propose first, build on green light.
- Show him visual output for judgment before scaling anything (he has strong taste and rejects fast).
- Persistent memory for cross-session context also lives in Claude's memory directory
  (`content-engine-project.md`); keep it and this file in sync on major decisions.
