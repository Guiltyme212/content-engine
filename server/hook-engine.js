// hook-engine.js — the brain behind the Hook lab.
//
// MULTI-TENANT: nothing about any single brand lives here. The brand (name, voice,
// audience, aesthetic, niche) arrives at call time as a `brief` object — the same shape
// the website's COMPANY.brief() produces — and is injected as DATA. This engine works for
// Kokoro, a fitness app, a finance newsletter, anything. If you ever feel the urge to type
// "lowercase" or "dusk" in here, stop: that belongs to a tenant's profile.
//
// The method is adapted from the "hook machine" approach: don't ask a model to "write
// hooks", give it (1) universal winning-hook principles, (2) a format-fit screen so it
// won't force a mismatched pattern onto a topic, and (3) an A–F grading rubric so weak
// hooks never reach the user.

// Read config LAZILY at call time. The server loads .env after this module is imported
// (ES imports evaluate first), so reading these at module top would capture empty values.
const cfg = () => ({
  provider: process.env.MODEL_PROVIDER || 'openai',
  model: process.env.MODEL_NAME || 'gpt-5.6-sol',
  // gpt-4o runs it today on the working OpenAI key. HOOK_MODEL_KEY is the key Dan pasted —
  // used only if wired to a provider later. OPENAI_API_KEY is the live default.
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY || process.env.HOOK_MODEL_KEY,
});

// ── Universal principles (brand-agnostic) ──────────────────────────────────────────────
const PRINCIPLES = `
UNIVERSAL HOOK PRINCIPLES (apply to every brand, every niche):
1. SPECIFIC beats abstract. Concrete outcome, number, or exact moment — never a vague label.
   ("the magic number is one honest sentence" > "how to feel better")
2. FRONT-LOAD the payoff. The value lands in the first few words. No throat-clearing
   ("here's how to…", "let me tell you about…", "in this post…").
3. CONFIDENT DECLARATIVES beat hedged questions. State it as true. Avoid "do you ever…?".
4. TWO-SENTENCE AMPLIFIER. A strong hook is often a claim + a second line that reframes,
   contrasts, or raises the stakes. The second line earns the swipe.
5. NAME THE PERSON OR MOMENT. Speak to the exact human scrolling and the exact moment they're
   in — recognition is what stops the thumb.
6. ONE SAVE / SHARE TRIGGER where it's natural (a reframe worth keeping, a line worth sending
   to a friend). Never forced.
7. VOICE LOCK. The hook MUST sound like the brand's voice and obey its "don't" list. A hook
   that breaks brand voice is an automatic C or below no matter how clever.
8. FORMAT FIT. Only use a pattern that suits THIS topic. Do not force a stat/case-study
   pattern onto a conceptual or emotional topic (that cross-format forcing is the #1 way AI
   hooks fail). If a pattern doesn't fit, don't use it.
`;

// Brand-agnostic structural patterns. These are shapes, not brand copy — the model fills
// them in the tenant's own voice, and skips any that don't fit the topic.
const PATTERNS = `
HOOK PATTERNS (structures — fill in the brand's voice, use only those that fit the topic):
- identity: "for the ones who ______"  /  "for anyone who ______"
- POV / being-seen: "POV: you ______ and nobody noticed"
- reframe: "______ isn't ______. it's ______."
- permission: "you don't need ______. you need ______."
- self-diagnosis listicle: "signs you're ______ (not ______)"
- authority + curiosity: "______ in ______ do ______ instead of ______"
- specificity / number: "the ______ number is ______"  /  "N signs your ______"
- curiosity gap: "things nobody tells you about ______"
- contrarian: "everyone thinks ______. the truth is ______."
- reframe-of-insult: reclaim a label the audience has been called
`;

const GRADING = `
GRADE every hook A–F:
A = stops the scroll cold; specific; perfectly on brand voice; has save/share pull.
B = strong and on-voice; one small softness (slightly long, slightly less specific).
C = generic, or voice is a bit off, or the pattern is a loose fit.
D–F = vague, wrong voice, forced/mismatched pattern, or throat-clearing.
Only hooks graded A or B are worth showing. Be a harsh grader — most first drafts are C.
`;

function briefBlock(brief = {}) {
  const b = brief || {};
  return `BRAND PROFILE (this is the tenant — write in THIS voice, for THIS audience):
- name: ${b.name || '(unnamed brand)'}
- what it is: ${b.oneLiner || b.whatItIs || '(not specified)'}
- audience: ${b.audience || '(not specified)'}
- voice: ${b.voice || (Array.isArray(b.voiceTags) ? b.voiceTags.join(', ') : '(not specified)')}
- aesthetic: ${b.aesthetic || '(not specified)'}
- niche: ${b.niche || '(not specified)'}
- do: ${b.do || 'validate the audience; speak to their real moment; stay in the voice above'}
- don't: ${b.dont || 'clichés, hype, anything that breaks the brand voice'}`;
}

// ── Prompt builders ────────────────────────────────────────────────────────────────────
function generatePrompt({ brief, topic, seeds, liked, disliked, count = 6 }) {
  const seedList = (Array.isArray(seeds) ? seeds : []).map((s) => String(s).trim()).filter(Boolean);
  const likedList = (Array.isArray(liked) ? liked : []).map((s) => String(s).trim()).filter(Boolean);
  const dislikedList = (Array.isArray(disliked) ? disliked : []).map((s) => String(s).trim()).filter(Boolean);
  const system = `You are a world-class short-form hook writer. You write the FIRST SLIDE of
image carousels — the one line that decides whether someone stops scrolling. You write in the
loaded brand's exact voice and never break it.
${PRINCIPLES}
${PATTERNS}
${GRADING}
Return ONLY JSON: {"hooks":[{"text": string, "pattern": string, "why": string (one short line
on why it stops the scroll), "grade": "A"|"B"|"C"|"D"|"F"}]}. Provide up to ${count} hooks,
but ONLY grade-A or grade-B ones — if fewer than ${count} are that good, return fewer. Never
pad with weak hooks. Match the brand's casing exactly (if the voice is lowercase, write
lowercase).`;

  let user = `${briefBlock(brief)}\n\n`;

  if (seedList.length) {
    // SEED MODE — the user pasted hooks they love; make MORE in that exact style.
    user += `HOOKS THE USER LOVES — study their style, rhythm, structure, and energy, then
write MORE hooks with the same feel in the brand's voice. You may riff on these AND invent
fresh angles in the same vein. Do NOT just copy them.
${seedList.map((s) => '• ' + s).join('\n')}\n\n`;
    if (topic && topic.trim()) user += `Keep them roughly about: ${topic.trim()}\n\n`;
    user += `Write up to ${count} new hooks in that style. Grade honestly (A/B only). JSON only.`;
  } else {
    user += `TOPIC for this batch: ${topic && topic.trim() ? topic.trim() : "(no topic given — write on-brand hooks about the audience's core pain, drawn from the brand profile above)"}\n\n`;
    user += `Write hooks about this topic, in the brand's voice, applying the principles. Screen
out any pattern that doesn't fit. Grade honestly. Return JSON only.`;
  }

  // TASTE LEARNING — steer this batch by what the user has already kept vs passed on.
  if (likedList.length || dislikedList.length) {
    user += `\n\n── THE USER'S TASTE SO FAR (learn from this — make THIS batch land better) ──`;
    if (likedList.length) {
      user += `\nHooks they KEPT (they like this vibe, angle, rhythm — lean toward these qualities):\n${likedList.map((s) => '✓ ' + s).join('\n')}`;
    }
    if (dislikedList.length) {
      user += `\nHooks they PASSED on (do NOT repeat these vibes/angles/openers — move away from them):\n${dislikedList.map((s) => '✗ ' + s).join('\n')}`;
    }
    user += `\nDo NOT reuse any hook listed above (kept or passed) — every hook must be new.`;
  }

  return { system, user };
}

function gradePrompt({ brief, hook }) {
  const system = `You are a ruthless but constructive hook editor. You grade a hook against the
rubric below and rewrite it stronger — in the loaded brand's exact voice.
${PRINCIPLES}
${GRADING}
Return ONLY JSON: {"grade":"A".."F","breakdown": string (2-3 short lines: what works, what's
weak, referencing the principles), "rewrites":[{"text": string, "why": string}]}. Provide 3
rewrites, each a genuine improvement, each on brand voice. Match the brand's casing exactly.`;

  const user = `${briefBlock(brief)}

THE USER'S DRAFT HOOK:
"${hook}"

Grade it, explain briefly, and give 3 stronger rewrites in the brand voice. JSON only.`;

  return { system, user };
}

// ── Model call ─────────────────────────────────────────────────────────────────────────
async function callModel({ system, user }) {
  const c = cfg();
  if (c.provider === 'anthropic') {
    if (!c.anthropicKey) throw new Error('No Anthropic key set (ANTHROPIC_API_KEY).');
    return callAnthropic({ system, user }, c);
  }
  if (!c.openaiKey) throw new Error('No OpenAI key set (OPENAI_API_KEY).');
  return callOpenAI({ system, user }, c);
}

async function callOpenAI({ system, user }, c) {
  const payload = {
    model: c.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  // gpt-5.x and o-series only accept the DEFAULT temperature; older models take a custom one.
  const supportsTemp = !/^(gpt-5|o\d)/i.test(c.model);
  if (supportsTemp) payload.temperature = 0.9;

  const call = () => fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.openaiKey}` },
    body: JSON.stringify(payload),
  });

  let res = await call();
  if (!res.ok) {
    let txt = await res.text().catch(() => '');
    // one retry: drop temperature if the model rejects a custom value
    if (payload.temperature !== undefined && /temperature/i.test(txt)) {
      delete payload.temperature;
      res = await call();
      if (!res.ok) { txt = await res.text().catch(() => ''); throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`); }
    } else {
      throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`);
    }
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}

async function callAnthropic({ system, user }, c) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: c.model.startsWith('claude') ? c.model : 'claude-sonnet-5',
      max_tokens: 1500,
      temperature: 0.9,
      system: system + '\nReturn ONLY the JSON object, no prose, no code fences.',
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '{}';
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    throw new Error('Model did not return valid JSON.');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────────────
export async function generateHooks({ brief, topic, seeds, liked, disliked, count = 6 }) {
  const raw = await callModel(generatePrompt({ brief, topic, seeds, liked, disliked, count }));
  const out = parseJson(raw);
  const hooks = Array.isArray(out.hooks) ? out.hooks : [];
  // safety net: only surface A/B even if the model slips
  return hooks
    .filter((h) => h && h.text && /^[AB]/i.test(String(h.grade || 'A')))
    .slice(0, count);
}

export async function gradeHook({ brief, hook }) {
  const raw = await callModel(gradePrompt({ brief, hook }));
  const out = parseJson(raw);
  return {
    grade: out.grade || '?',
    breakdown: out.breakdown || '',
    rewrites: Array.isArray(out.rewrites) ? out.rewrites.slice(0, 3) : [],
  };
}

export function modelInfo() {
  const c = cfg();
  return { provider: c.provider, model: c.model, openaiKey: !!c.openaiKey };
}
