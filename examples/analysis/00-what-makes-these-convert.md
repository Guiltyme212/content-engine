# What makes these carousels convert — master synthesis

This is the cross-example teardown of the three winning carousels in `examples/`. It is the
"why" layer. The actionable rules distilled from it live in `carousel-system-prompt.md` (the
generator's instructions) — read this to understand, read that to build.

**Every example was copied because it converts.** They are not random. Study the shared DNA.

---

## The three examples at a glance

| | Ex 1 — Waist (fitness) | Ex 2 — Burnout symptoms (wellness) | Ex 3 — Burnout recovery (story) |
|---|---|---|---|
| Slides | 7 | 6 | 8 |
| Likes | 397.1K | 105.4K | 6.7K |
| Saves | 145.8K | 16.2K | 3.2K |
| Save/Like | ~37% | ~15% | ~48% |
| Structure | Tip listicle `N. do X (benefit)` | Symptom checklist `N) you feel X` | Personal story `N. I did X` |
| Voice | casual, "my routine" | lowercase, gentle, therapist-y | first-person confession |
| Visuals | real photos + white overlay text | soft gradient backgrounds + dark text | cohesive warm/cozy photos + white text |
| Plug position | slide 4 / 7 | slide 3 / 6 | slide 6 / 8 |

---

## The 8 shared laws (this is the whole system)

### LAW 1 — Saves are the KPI, not likes
All three are save-heavy (15–48% of likes). Saves tell the algorithm "this has lasting value" and are the strongest ranking signal for how-to/list content. **Every carousel must be built to be saved** — i.e. it must be a reference the viewer wants to come back to. If a carousel isn't save-worthy, it fails, no matter how pretty.

### LAW 2 — The cover is 90% of the result. It's a promise with an open loop.
The first slide's only job is to make swiping irresistible. All three covers do it with:
- **A concrete outcome or curiosity gap** ("shrink your waist", "things you didn't realize", "how I rebuilt my brain").
- **An open loop that cannot be closed on slide 1** — a colon, a number, a "how I". The payoff is physically elsewhere, so you must swipe.
- **Soft stakes in parentheses** ("this summer", "and you need to slow down", "when everyone said I'd never be the same").
> Formula: `[curiosity gap OR outcome] + [why now / stakes] + [open loop]`

### LAW 3 — One rigid, repeating slide skeleton
Once the viewer sees the pattern on slide 2, swiping becomes free. Every winner picks ONE skeleton and repeats it:
- Tip: `N. [action] ([3-word benefit])`
- Symptom: `N) [symptom]` → `[rule out boring cause]` → `[why it happens]`
- Story: `N. I [action]` → `[deeper emotional why + one metaphor]`
Never mix skeletons inside one carousel.

### LAW 4 — Every slide pays out twice: the WHAT and the WHY
No slide is just an instruction. Each pairs a concrete action/symptom with a compact reason or benefit. `No sugar after 6pm` is skippable; `No sugar after 6pm (lighter stomach)` is worth reading. The parenthetical/second-line is where the value is.

### LAW 5 — Specificity is credibility
`phone. keys. water bottle.` beats "you drop things." `3 months`, `12500 steps`, `10+ hours` beat "a while / lots of steps / plenty of sleep." Concrete numbers and named objects make invented content feel *observed*. Vague = fake = skipped.

### LAW 6 — The plug is a personal habit in the MIDDLE, never a CTA
This is the single most important monetization pattern, identical across all three:
- Position: middle-to-late slide (3/6, 4/7, 6/8) — **never slide 1, never the last slide, never "download now."**
- Framing: *"the tool I use"* / *"my therapist has me…"* / *"was my go-to for this"*, often with a `<3`.
- It rides the trust built by the preceding value slides. It reads as a friend's recommendation, not an ad.
> Our engine already knows this (playbook §"mid-carousel app plug ~tip 3"). These examples confirm it three times over.

### LAW 7 — Lowercase, first-person, zero hedging
Not one winner uses corporate voice, exclamation-shouting, or "consult a professional." They're lowercase or sentence-case, intimate, confident. TikTok rewards *a real person talking to you*, not a brand broadcasting. Authenticity beats authority.

### LAW 8 — Visual world must match the emotional register
- Fitness/how-to → real, imperfect, first-person photos (mirror selfies, POV). Realness = credibility.
- Mental health/calm → soft gradients, dusk skies, candles, cozy warm light. The palette *is* the feeling.
Pick ONE visual world per carousel and hold it across every slide. Cohesion reads as intentional; random stock reads as fake.

---

## Two structures we must both own

1. **The "YOU" diagnostic** (Ex 2) — symptom/sign checklist. Trigger: self-scanning, "do I have this?" Best for problem-aware audiences.
2. **The "I" transformation** (Ex 3) — personal-story listicle. Trigger: aspiration + permission, "I want that and it's allowed."

Plus the universal **tip listicle** (Ex 1) that works in any niche. These three cover ~all high-save carousels. Everything we generate should be one of these three shapes.

---

## The save-worthiness test (run on every draft)
Before a carousel ships, it must pass all five:
1. **Cover test:** would someone swipe past slide 1 without swiping? If it doesn't force a swipe, rewrite it.
2. **Skeleton test:** is every body slide the same shape? If not, unify.
3. **Double-payout test:** does every slide give both a what AND a why/benefit? If any slide is just an instruction, add the why.
4. **Specificity test:** are there real numbers and concrete nouns, not vague words? If it reads generic, it reads fake.
5. **Plug test:** is the product a mid-carousel personal habit, not a slide-1 or slide-last CTA? If it's a CTA, move and reframe it.

---

## How this improves what WE make (the strategy)

Our current playbook skeleton (validation ×4 → warmup → mid plug) is good but was Kokoro-shaped.
These examples give us a **brand-agnostic upgrade**:

1. **Adopt the 3 named structures** (tip / symptom / story) as selectable templates in the generator, not one fixed skeleton. Nazar's brands pick whichever fits.
2. **Hook bank upgrade:** rebuild `library/carousel-playbook.md` §hook-bank around the three cover formulas in LAW 2, each as a fill-in-the-blank the generator adapts to the loaded brand.
3. **Enforce the double-payout + specificity laws** in the system prompt so no slide ships as a bare instruction or a vague claim.
4. **Lock the plug rules** (middle slide, personal-habit framing, no CTA) as a hard constraint, not a suggestion.
5. **Bind visual world to emotional register** — the generator should pick photo-real vs. soft-gradient based on the brand's niche (fitness/how-to → real; calm/mental-health → atmospheric).
6. **Ship the save-worthiness test as a self-check** the generator (or a review agent) runs before output.
7. **Build the "you" AND "I" versions** for emotional niches like Kokoro — a symptom carousel and a recovery carousel are a natural pair.

The generator's actual operating instructions built from all of this are in
`carousel-system-prompt.md`.
