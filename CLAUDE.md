# Content Engine — project context

Read this first. It is the handoff document for any agent working in this repo.

## What this project is

An automated content engine whose end goal is **AI UGC creators promoting Kokoro** —
Dan's iOS app ([kokoromind.com](https://kokoromind.com), 4.9★): you vent by voice after a hard
day, it listens like a supportive friend, then makes a personalized 3–7 min meditation from
your own words. Audience: mostly women / "quiet humans". Brand voice: lowercase, intimate,
no toxic positivity ("i won't try to fix you. i'll just listen — and make you something").
Aesthetic: Japanese minimalism (sakura, lanterns, dusk, kanji 心).

Roadmap: image carousels first (proven cheapest format), AI video later. A learning loop
(post → pull metrics → learn which hooks/formats win → generate better) comes after the
basics work. Currently in **test mode**: prove the pipeline on Dan's own accounts; no TikTok
monetization needed. A website will be hosted on **Railway** (CLI v4.44 installed, repo
connected to GitHub `Guiltyme212/content-engine`) — task brief pending in
`docs/website-brief.md`.

## Repo layout

- `library/carousel-playbook.md` — **the copy/knowledge layer.** Format skeletons, hook bank,
  slide craft rules, visual rules, Kokoro brand brief. Generators write FROM this file.
  A future analyzer will scrape winning hooks/carousels and append to it (section 6).
- `output/post-XXX-*/` — finished ready-to-post carousels (JPEG slides + caption.txt).
  post-001: nature-psychology test. post-002: first Kokoro post.
- `docs/website-brief.md` — template awaiting Dan's description of the website task.
- `.agents/skills/` — installed skills (frontend-design, ui-ux-pro-max, design-taste-frontend,
  vercel-react-best-practices, gsd, use-railway). Symlinked into Claude Code.

## Locked-in decisions (do not relitigate without Dan)

1. **Image generation: OpenAI `gpt-image-2`** (1024x1536 portrait). `high` quality for slides
   with text (~$0.17/img), `medium` for drafts (~$0.04). Batch API halves costs at volume.
2. **Typography is rendered INSIDE the image by the model** — describe the font as design
   direction in the prompt (post-002 used: elegant thin serif, warm cream-white, lowercase,
   generous letter spacing) and demand EXACT spelling. Dan explicitly rejected programmatic
   text overlay (ugly system fonts); the GDI+ renderer from post-001 is fallback only.
   Review EVERY slide for typos; regenerate failures.
3. **Copy comes from the playbook**, not improvised — hooks from the hook bank, structure
   from a skeleton (Kokoro default: validation ×4 → warmup → soft app push on last slide only).
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
