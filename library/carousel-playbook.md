# Carousel Playbook

This file is the **copy/knowledge layer** of the content engine. The generator reads it before writing any post.
It will grow over time: a future **analyzer** will scrape top-performing carousels/hooks and append what works
(with metrics) to the hook bank and format sections. Human edits welcome — this is the steering wheel.

---

## 1. Format skeletons

### A. Validation listicle (soft app-push ladder) — DEFAULT for Kokoro
`hook → validation × 3-4 → warmup (habit/idea the app embodies) → app push (soft, personal)`
- Slides 2–5 must feel like organic comfort content with zero selling.
- The app appears ONLY on the last slide, phrased as a personal habit ("i vent to kokoro"), never as an ad.
- Source pattern: "content, content, content, content, ad warmup, app push" (proven $10k/mo app-founder format).

### B. Before/after proof
`hook (bold claim) → proof pair × 3-4 → opinionated payoff (comparison list)`
- Needs REAL imagery for the proof (satellite shots, screenshots, photos). Never AI-fake factual proof.

### C. Psychology facts
`hook (authority or curiosity) → fact × 4-5 → meta/share-trigger slide → emotional payoff + save CTA`
- Every fact must be defensible (real studies) — comment-section fact-checkers are part of distribution.

## 2. Hook bank (patterns, fill the blank)

- "for the ones who ______ all day" (identity + exhaustion)
- "POV: you ______ and nobody noticed" (identity + being seen)
- "______ isn't weakness. it's ______." (reframe)
- "you don't need ______. you need ______." (permission)
- "signs you're ______ (not ______)" (self-diagnosis listicle)
- "doctors in ______ prescribe ______ instead of ______" (authority + curiosity)
- "the magic number is ______" (specificity)
- "things nobody tells you about ______"
- "your brain is ______ years old. it still thinks ______." (evolutionary reframe)
- Numbers and hyper-specific first-person phrasing beat generic labels ("i would be unstoppable" > "glow up guide").

## 3. Slide craft rules

- Slide 1 decides everything: if it doesn't stop the scroll, nothing else matters.
- ≤ 20 words per slide. One idea per slide. Completion (swipe-to-end) is the ranking signal — no filler slides.
- 5–8 slides. Drop-off rises sharply after slide 7.
- Include one **share/save trigger**: a meta slide ("yes, including this one"), or "save this for ______".
- Soft CTA only. Let the content do the selling.
- Caption: one relatable line + a question (drives comments) + 4-6 niche hashtags. No line breaks on TikTok.
- Post 6–10pm local time of target market; attach trending calm audio on TikTok.

## 4. Visual series rules

- One post = one style recipe (same light, palette, mood in every prompt) so the carousel reads as designed.
- Text lives INSIDE the generated image (gpt-image-2 renders typography): specify font style, color, case,
  placement in the prompt, and demand EXACT spelling. Review every slide for typos; regenerate failures.
- Fallback: programmatic overlay renderer (kept from post-001) when perfect text control is needed.
- No fake UI screenshots, no watermarks, no real-brand imitations.

## 5. Brand brief: Kokoro (kokoromind.com)

- App: Kokoro (心) — "a meditation made from your own words". "Vent your mind. Change your life."
- What it does: you speak what's on your mind → kokoro listens → makes a personalized 3–7 min meditation
  in a voice that fits the mood (gen-z raw / spiritual / bedtime). Private: no tracking, sharing, scoring.
- Audience: people (especially women / "quiet humans") wrecked after a hard day, who want to vent to
  something that feels like a supportive friend — not advice, not therapy-speak, not toxic positivity.
- Voice: lowercase, intimate, honest, slightly irreverent. Core promise: "i won't try to fix you.
  i'll just listen — and make you something."
- Aesthetic: Japanese minimalism — sakura, lanterns, dusk, rain on windows, warm rooms. Kanji accents (心).
- Do: validate ("that really was a lot"), permission-giving, nervous-system language, privacy point.
- Don't: "fix yourself", productivity framing, clinical terms, hard sells, emoji spam.
- CTA phrasing: "i vent to kokoro. it listens — then makes a meditation from my own words." + free on iOS.

## 6. Learning loop

The analyzer appends here per niche: winning hooks with view/save/share stats, format win-rates,
best posting slots, and reference carousels worth cloning. Sources live in `examples/`.

### 2026-07-20 · Reference analysis: two viral app-plug carousels (added by Dan + Claude)

**Example 1 — `examples/example1/` · "how to shrink your waist this summer:" (@liyah, fitness)**
397.1K likes · 145.8K saves · 10.7K shares · 474 comments · 7 slides.
- Every slide is an AUTHENTIC casual phone photo (mirror selfie, Stanley cup, treadmill POV,
  gym mirror, bed POV). Zero designed graphics — reads as a friend's camera roll, not an ad.
- Text: TikTok-native bold white sans with black outline, short, centered-low.
- Tip formula: `N. claim (benefit)` — "1. No sugar after 6pm (lighter stomach)".
- **App plug is MID-carousel** (tip 3 of 6, slide 4/7): "(I track mine in HealthMeter)" and the
  photo itself is the app open on a phone. Not the last slide.
- One absurd comment-bait tip ("5. Sleep in a plank position") — people search it verbatim;
  the screenshot's own search bar reads "plank position sleep tutorial". Comments = distribution.

**Example 2 — `examples/example2/` · "5 physical things you didn't realize were symptoms of
serious burnout" (@jade, wellness — a direct Kokoro-format neighbor)**
105.4K likes · 16.2K saves · 2.5K shares · 6 slides.
- Hook over a HAPPY real photo (girl on a boat) — emotional contrast with the heavy topic.
- Slides 2–6: text-only on real dusk-sky photos; the sky palette SHIFTS across the set
  (warm gold → orange → lavender → blue → purple → red last-light). Near-black lowercase
  sans, centered, blank-line gaps between short paragraphs.
- Slide structure: `N) symptom` → felt description → mechanism ("chronic stress actually
  reduces fine motor coordination because your brain is overloaded"). Validation + authority.
- **App plug MID-carousel** (tip 3, slide 4/6), framed through authority + affection:
  "my therapist has me consistently check in… i use the vent now app to process what i'm
  feeling so it doesn't silently pile up <3 it's genuinely been life changing."
- Caption drives swipe-back: "buying a mouth guard to sleep in and exercise in helps with #1 <3"
  — references a numbered tip, so readers re-open the carousel.

**Rule updates adopted from this analysis:**
1. **Mid-carousel plug beats last-slide plug.** Weave the app into tip #3 (± middle slide) as a
   personal habit inside a numbered item. Last slide becomes a soft closer / save trigger instead.
2. Two proven visual recipes: (A) authentic casual photos + white outlined text (needs real
   user photos); (B) text-on-dusk-sky gradient set with shifting palette (fully generatable,
   native fit for Kokoro).
3. Include one surprising/absurd tip as comment bait.
4. Caption must reference a numbered tip ("#1 helps me most <3") to trigger re-swipes.
5. Slide dots (position indicator) are part of the native format — preview UI must show them.
6. Last slide = meta/emotional closer ("you're reading this instead of sleeping. that's the
   sign.") — doubles as save trigger.
