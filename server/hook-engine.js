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
  // 'proxy' provider: an OpenAI-compatible endpoint at a custom base URL (e.g. a Claude proxy
  // that speaks /v1/chat/completions). Base URL + key come from env — never hardcoded.
  proxyBase: process.env.PROXY_BASE_URL,
  proxyKey: process.env.PROXY_API_KEY || process.env.HOOK_MODEL_KEY,
  reasoningEffort: process.env.MODEL_REASONING_EFFORT, // e.g. "medium"
});

// ── Universal principles (brand-agnostic) ──────────────────────────────────────────────
const PRINCIPLES = `
UNIVERSAL HOOK PRINCIPLES (apply to every brand, every niche):
1. SPECIFIC beats abstract. Never name a concept when you can name where it lives: a body
   part, a clock time, a scene the reader has stood in. ("crying in the car after work" >
   "emotional exhaustion"; "your paycheck is gone by the 12th" > "bad budgeting"; "your skin
   at 3pm" > "skincare mistakes").
2. FRONT-LOAD VALUE OR TENSION. The concrete promise or recognizable problem lands in the first
   few words. A carousel cover keeps enough of the answer unpaid to earn slide two. No throat-clearing
   ("here's how to…", "let me tell you about…", "in this post…").
3. CONFIDENT DECLARATIVES beat hedged questions. State it as true. Avoid "do you ever…?".
4. TWO-SENTENCE AMPLIFIER. A strong hook is often a claim + a short second line (often a
   parenthetical) doing ONE precise job: read the reader's mind ("yes, that one"), kill their
   top objection ("without ______ for an hour"), add a twist that makes the answer unguessable
   ("it wasn't about sleep"), or tease one numbered item ("#3 is why ______"). The second
   line earns the swipe.
5. NAME THE PERSON OR MOMENT. Speak to the exact human scrolling and the exact moment they're
   in — recognition is what stops the thumb.
6. ONE SAVE / SHARE TRIGGER where it's natural (a reframe worth keeping, a line worth sending
   to a friend). Never forced.
7. VOICE LOCK. The hook MUST sound like the brand's voice and obey its "don't" list. A hook
   that breaks brand voice is an automatic C or below no matter how clever.
8. FORMAT FIT. Only use a pattern that suits THIS topic. Do not force a stat/case-study
   pattern onto a conceptual or emotional topic (that cross-format forcing is the #1 way AI
   hooks fail). If a pattern doesn't fit, don't use it.
9. BLUNT BEATS POETIC — within the brand's voice. Visceral verbs, severity words, and real
   timeframes ("for years", "every single night", "after 6 years of") over soft phrasing.
   Soft abstractions whisper; winners state the dramatic concrete thing plainly.
10. ADJACENT TERRITORY IS FAIR GAME. The hook may live in ANY true, recognizable moment of
   the audience's life — not only the brand's core subject. The carousel body pivots later
   through one mid-list personal-tool cameo tied to one item, so judge the hook as pure
   editorial; it only needs a list or story shape that can host that one cameo slide
   naturally.
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
- objection-killer how-to: "how to ______: (without ______)"
- mind-reader: "how to stop ______ (yes, that one)"
- secret scene story: "how i stopped ______ (nobody knew)"
- body/scene blind-spot count: "N things your ______ does when you ______"
- timeframe transformation: "how i ______ after ______ of ______" + a twist stake
`;

const GRADING = `
GRADE every hook A–F:
A = stops the scroll cold; names a concrete scene, time, or body detail; perfectly on brand
    voice; second line does a real job (mind-read, objection-kill, twist, or tease).
B = strong and on-voice; one small softness (slightly long, slightly less specific, or the
    second line merely restates instead of adding).
C = generic, or names an abstract concept where a scene should be ("emotions", "wellness",
    "productivity"), or voice is a bit off, or the pattern is a loose fit.
D–F = vague, wrong voice, forced/mismatched pattern, or throat-clearing.
Only hooks graded A or B are worth showing. Be a harsh grader — most first drafts are C.
`;

// Executable, brand-agnostic excerpt of library/carousel-playbook.md. Keep this free of
// tenant names, product facts, copied hooks, statistics, and unsupported claims.
export const CONTENT_FIRST_REFERENCE = `
TRUSTED CONTENT-FIRST REFERENCE STRATEGY:

COVER ANATOMY - a winning first slide carries all three, readable in under two seconds:
1) a concrete desired outcome OR a curiosity gap; 2) a reason to care right now - often a
soft parenthetical stake; 3) an open loop that cannot close on slide one (a colon, a bounded
count, a first-person "how i"). If a screenshot of slide one alone satisfies the reader, the
hook fails.

CONCRETENESS RULE: name the place the problem lives - a body part, a clock time, a scene the
reader has stood in - never the abstract concept for it. Severity words and real timeframes
raise the stakes. The parenthetical does ONE precise job: mind-read, objection-kill, twist,
or numbered tease.

TERRITORY RULE: the hook may live in any true moment of the audience's life, not only the
brand's core subject. It only needs to open a list or story with one later slide where a
personal tool naturally solves one item - that single cameo slide is the only bridge to the
product, so purely editorial hooks in adjacent territory are as valuable as on-topic ones.

- SEARCHABLE HOW-TO LIST: a desired outcome plus a real constraint or timeframe, followed by
  numbered, specific actions. Each action earns its slide with a short, truthful reason.
- BLIND-SPOT DIAGNOSTIC: a bounded number of concrete things the reader did not realize point
  to a hidden tension. Later slides repay the debt one recognizable item at a time.
- FIRST-PERSON RECOVERY STORY: how I [specific change] after [specific low point], plus one
  unresolved stake. Later slides reveal surprising but ordinary actions in sequence.
- IDENTITY / BEING-SEEN STORY: name an exact behavior or moment that makes the reader feel
  recognized, then leave the explanation or reframe for following slides.
- CONTRARIAN REFRAME: challenge the surface explanation, but withhold enough of the new
  explanation that the reader still needs the next slide.

BODY CONTRACT the hook must set up: the later slides repeat ONE slide shape for the whole
carousel (numbered action + short benefit, symptom + honest why, or first-person step +
reason). Every slide pays out a WHAT and a WHY; specifics are concrete nouns and real
numbers, never vague quantities. A product may appear later as one small, truthful
personal-tool cameo on a middle slide - never slide one, never the last slide, never a call
to action.

These are structures, not copy templates. Never carry a reference brand, app, statistic,
medical claim, audience fact, or product behavior into another tenant. Details may be
surprising, but they must be truthful and defensible. The editorial content earns attention
first.
`;

const PRODUCT_LANGUAGE = /\b(?:app|platform|software|subscription|course|dashboard|assistant|generator|tool|solution|download|sign[\s-]?up|free trial|link in bio|available (?:on|now)|get started|book a call)\b|\b(?:our|this|the) (?:service|product|feature)\b/i;
const PROPOSITION_LANGUAGE = /\b(?:turn|transform|convert)\b.{0,55}\binto\b|\b(?:made|designed|built|created|personalized|customi[sz]ed)\b.{0,35}\bfor you\b|\bso you can\b|\b(?:all|everything) you need\b/i;
const MARKETING_IMPERATIVE = /^(?:say|share|tell|discover|unlock|experience|transform|create|try|download|join|meet|introducing|get started)\b/i;
const AMBIGUOUS_BRAND_WORDS = new Set(['one', 'every', 'calm']);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectedBrandPhrases(brief = {}) {
  const host = String(brief?.domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/:?#]/)[0];
  const domain = host.split('.')[0];
  return [...new Set([brief?.name, domain]
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 3 && !AMBIGUOUS_BRAND_WORDS.has(value.toLowerCase())))];
}

function hasProductHelpProposition(value, brief = {}) {
  const productSubject = /\b(?:(?:our|this|the)\s+)?(?:app|platform|software|subscription|course|dashboard|assistant|generator|tool|solution|service|product|feature)\b.{0,28}\bhelps?\s+(?:you|people|teams)\b/i;
  if (productSubject.test(value)) return true;
  return protectedBrandPhrases(brief).some((phrase) => (
    new RegExp(`\\b${escapeRegExp(phrase)}\\b.{0,28}\\bhelps?\\s+(?:you|people|teams)\\b`, 'i').test(value)
  ));
}

export function hasRepayableDebt(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return false;

  const boundedList = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?:\s+[\w'\u2019-]+){0,4}\s+\b(?:signs?|symptoms?|things?|reasons?|mistakes?|ways?|habits?|steps?|rules?|lessons?|questions?|changes?|clues?|patterns?)\b/i.test(value);
  const howJourney = /^(?:how to|how i)\b.{5,}/i.test(value);
  const recognitionDebt = /\bnobody (?:ever )?(?:asked|noticed|warned|told)\b|\bdidn['\u2019]?t realize\b|\bwithout realizing\b|\bwhat (?:would|actually|really|happened|changed)\b|\bwhy (?:you|your|this|that|it)\b/i.test(value);
  const directQuestion = /^(?:who|what|why|how)\b[^?]{4,}\?$/i.test(value);
  const clauses = value.split(/[.!?;]|\s(?:but|yet|instead|while|except|rather than)\s/i)
    .map((part) => part.trim()).filter((part) => part.split(/\s+/).length >= 2);
  const actualContrast = clauses.length >= 2 && (
    (/\b(?:isn['\u2019]?t|aren['\u2019]?t|wasn['\u2019]?t|weren['\u2019]?t|don['\u2019]?t|doesn['\u2019]?t|didn['\u2019]?t|not|never|nobody|nothing)\b/i.test(value)
      && /\b(?:but|yet|instead|while|except|rather than|actually|still|only|just|the truth|the problem|didn['\u2019]?t get the memo)\b/i.test(value))
    || /\beveryone thinks\b.{0,100}\b(?:truth|problem|actually|but|wrong)\b/i.test(value)
    || /\b(?:quiet|stopped|finished|ended|left|gone)\b.{0,90}\b(?:still|didn['\u2019]?t|doesn['\u2019]?t|keeps?|starts?)\b/i.test(value)
  );
  const timeMarker = '(?:\\d{1,2}(?::\\d{2})?\\s?(?:a\\.?m\\.?|p\\.?m\\.?)|today|tonight|this morning|this evening|before bed|after work|by midnight|sunday night)';
  const reversal = '(?:still|already|only|but|yet|instead|before|after|doesn[\'\\u2019]?t|didn[\'\\u2019]?t|isn[\'\\u2019]?t|not)';
  const specificTimeReversal = new RegExp(`\\b${timeMarker}\\b.{0,90}\\b${reversal}\\b|\\b${reversal}\\b.{0,90}\\b${timeMarker}\\b`, 'i').test(value);

  return boundedList || howJourney || recognitionDebt || actualContrast || specificTimeReversal || directQuestion;
}

export function promisedListCount(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const match = value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b(?:\s+[\w'\u2019-]+){0,4}\s+\b(?:signs?|symptoms?|things?|reasons?|mistakes?|ways?|habits?|steps?|rules?|lessons?|questions?|changes?|clues?|patterns?)\b/i);
  if (!match) return 0;
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return Number(match[1]) || words[match[1].toLowerCase()] || 0;
}

function hasFirstPersonSource(brief = {}) {
  const context = String(brief?.context || '');
  return /\b(?:i|i['\u2019](?:m|ve|d|ll)|me|my|mine)\b/i.test(context);
}

export function lintHook(text, { brief = {}, mode = 'general' } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const reasons = [];
  if (!value) return ['missing hook text'];
  if (mode !== 'contentFirst') return reasons;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 5) reasons.push('too little concrete editorial information');
  if (words.length > 30) reasons.push('too long for a first slide');
  for (const phrase of protectedBrandPhrases(brief)) {
    if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i').test(value)) {
      reasons.push('names the brand on slide one');
      break;
    }
  }
  if (/\b(?:we|we['\u2019](?:ll|re|ve|d)|our|ours|us)\b/i.test(value)) {
    reasons.push('uses first-person brand language');
  }
  if (PRODUCT_LANGUAGE.test(value)) reasons.push('names a product, feature, or call to action');
  if (PROPOSITION_LANGUAGE.test(value) || hasProductHelpProposition(value, brief)) {
    reasons.push('reads like a product proposition');
  }
  if (MARKETING_IMPERATIVE.test(value)) reasons.push('opens like a marketing tagline');
  if (!hasRepayableDebt(value)) reasons.push('does not create a concrete, repayable curiosity debt');
  if (promisedListCount(value) > 5) reasons.push('promises more list items than this carousel can repay');
  if (/\b(?:how i|i|i['\u2019](?:m|ve|d|ll)|me|my|mine)\b/i.test(value) && !hasFirstPersonSource(brief)) {
    reasons.push('uses a first-person story that is not supplied in the brand context');
  }
  return [...new Set(reasons)];
}

export function inferHookPattern(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (/^(?:\d+|one|two|three|four|five|six|seven)\b/i.test(value)
    && /\b(?:signs?|symptoms?|things?|reasons?|mistakes?|ways?|habits?|steps?|rules?|lessons?)\b/i.test(value)) {
    return 'blind-spot list';
  }
  if (/^how to\b/i.test(value)) return 'searchable how-to';
  if (/^how i\b/i.test(value) || /^i\b.{0,90}\b(?:after|before|when)\b/i.test(value)) {
    return 'first-person story';
  }
  if (/^(?:pov\s*:|for (?:the ones|anyone)\b)/i.test(value)
    || /\bnobody (?:noticed|asked|saw|warned)\b/i.test(value)) {
    return 'identity recognition';
  }
  if (/\b(?:isn['\u2019]?t|aren['\u2019]?t|wasn['\u2019]?t|doesn['\u2019]?t mean|everyone thinks|the truth is)\b/i.test(value)
    || /\bnot\b.{0,45}\b(?:it['\u2019]?s|it is|instead)\b/i.test(value)) {
    return 'contrarian reframe';
  }
  return 'editorial story';
}

export function briefBlock(brief = {}) {
  const b = brief || {};
  const voice = Array.isArray(b.voice)
    ? b.voice.join(', ')
    : b.voice || (Array.isArray(b.voiceTags) ? b.voiceTags.join(', ') : b.voiceTags);
  const aesthetic = Array.isArray(b.look)
    ? b.look.join(', ')
    : b.aesthetic || b.look || (Array.isArray(b.lookTags) ? b.lookTags.join(', ') : b.lookTags);
  return `BRAND PROFILE (this is the tenant — write in THIS voice, for THIS audience):
- name: ${b.name || '(unnamed brand)'}
- what it is: ${b.oneLiner || b.whatItIs || b.product || '(not specified)'}
- audience: ${b.audience || '(not specified)'}
- voice: ${voice || '(not specified)'}
- aesthetic: ${aesthetic || '(not specified)'}
- niche: ${b.niche || '(not specified)'}
- do: ${b.do || 'validate the audience; speak to their real moment; stay in the voice above'}
- don't: ${b.dont || 'clichés, hype, anything that breaks the brand voice'}
- current content context: ${b.context || '(not specified)'}`;
}

// ── Prompt builders ────────────────────────────────────────────────────────────────────
export function generatePrompt({ brief, topic, seeds, liked, disliked, count = 6, mode = 'general' }) {
  const seedList = (Array.isArray(seeds) ? seeds : []).map((s) => String(s).trim()).filter(Boolean);
  const likedList = (Array.isArray(liked) ? liked : []).map((s) => String(s).trim()).filter(Boolean);
  const dislikedList = (Array.isArray(disliked) ? disliked : []).map((s) => String(s).trim()).filter(Boolean);
  const contentFirst = mode === 'contentFirst';
  const requestedCount = contentFirst
    ? Math.min(12, Math.max((Number(count) || 0) * 3, 8))
    : count;
  const system = `You are a world-class short-form hook writer. You write the FIRST SLIDE of
image carousels — the one line that decides whether someone stops scrolling. You write in the
loaded brand's exact voice and never break it.
${PRINCIPLES}
${PATTERNS}
${GRADING}
${contentFirst ? `${CONTENT_FIRST_REFERENCE}

CONTENT-FIRST EDITORIAL MODE - HARD RULES:
- Slide one is editorial, not an ad. Never name the brand, app, product, feature, tool, CTA,
  first-person brand language, a solution, or a product outcome.
- Do not explain what the company does. Do not write a tagline, value proposition, generic
  imperative, complete answer, or promise made for the reader.
- Every hook must create CONCRETE CURIOSITY DEBT: identify the precise question the reader
  needs the next slides to answer. The debt must be repayable by a coherent 5-to-7-slide
  diagnostic list, practical list, or story - never vague inspiration.
- Start from a recognizable human moment, behavior, contradiction, or bounded promise. The
  line should become weaker, not remain equally valid, if transplanted to 100 unrelated brands.
- BATCH MIX QUOTA: return at least 2 bounded-count list hooks promising 3 to 5 items, at least
  2 HOW TO hooks, and at least 2 identity-recognition or contrarian hooks whose exact unresolved
  question is clear. Use HOW I only when current content context explicitly supplies that true
  first-person experience. Never invent a founder, customer, or narrator anecdote. Do not return
  several paraphrases of the same emotional claim.
- In the why field, name both the withheld answer and the later list or story that repays it.
` : ''}
Return ONLY JSON: {"hooks":[{"text": string, "pattern": string, "why": string (one short line
on why it stops the scroll), "grade": "A"|"B"|"C"|"D"|"F"}]}. Provide up to ${requestedCount} hooks,
but ONLY grade-A or grade-B ones — if fewer than ${requestedCount} are that good, return fewer. Never
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
    user += `Write up to ${requestedCount} new hooks in that style. Grade honestly (A/B only). JSON only.`;
  } else {
    user += `TOPIC for this batch: ${topic && topic.trim() ? topic.trim() : "(no topic given — write on-brand hooks about the audience's core pain, drawn from the brand profile above)"}\n\n`;
    user += `Write hooks about this topic, in the brand's voice, applying the principles. Screen
out any pattern that doesn't fit. Grade honestly. Return JSON only.`;
  }
  if (contentFirst) {
    user += `\n\nThis topic is editorial audience tension, not permission to advertise the product.
Build a useful list or story the carousel can actually deliver. Keep slide one product-free.`;
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
Return ONLY a JSON object with EXACTLY these keys — do not rename, add, or nest them:
{"grade": "A"|"B"|"C"|"D"|"F", "breakdown": string (2-3 short lines: what works, what's weak,
referencing the principles), "rewrites": [{"text": string, "why": string}, ...]}.
Use the key "text" (not "hook"/"line"), "breakdown" (not "assessment"/"analysis"), and
"rewrites" (not "suggestions"/"reframes"). Provide exactly 3 rewrites, each a genuine
improvement, each on brand voice. Match the brand's casing exactly.`;

  const user = `${briefBlock(brief)}

THE USER'S DRAFT HOOK:
"${hook}"

Grade it, explain briefly, and give 3 stronger rewrites in the brand voice. JSON only.`;

  return { system, user };
}

// ── Model call ─────────────────────────────────────────────────────────────────────────
export async function callModel({ system, user, maxTokens, provider, model }) {
  const configured = cfg();
  const c = { ...configured, provider: provider || configured.provider, model: model || configured.model };
  if (c.provider === 'proxy') {
    if (!c.proxyBase) throw new Error('No proxy base URL set (PROXY_BASE_URL).');
    if (!c.proxyKey) throw new Error('No proxy key set (PROXY_API_KEY).');
    return callOpenAICompatible({ system, user, maxTokens }, c, c.proxyBase, c.proxyKey);
  }
  if (c.provider === 'anthropic') {
    if (!c.anthropicKey) throw new Error('No Anthropic key set (ANTHROPIC_API_KEY).');
    return callAnthropic({ system, user, maxTokens }, c);
  }
  if (!c.openaiKey) throw new Error('No OpenAI key set (OPENAI_API_KEY).');
  return callOpenAICompatible({ system, user, maxTokens }, c, 'https://api.openai.com', c.openaiKey);
}

// Works for OpenAI and any OpenAI-compatible endpoint (e.g. a Claude proxy that exposes
// /v1/chat/completions). baseUrl has NO trailing /v1 — we append the path here.
export function compatibleMessages({ system, user }, { provider, model } = {}) {
  const isClaudeProxy = provider === 'proxy' && /claude/i.test(model || '');
  // Some OpenAI-compatible Claude proxies silently discard `system` role messages. In that
  // case the writer never sees the schema or quality rules. Put the trusted instructions in
  // the visible request as well, ahead of the clearly delimited untrusted runtime packet.
  return isClaudeProxy
    ? [{ role: 'user', content: `TRUSTED SYSTEM INSTRUCTIONS:\n${system}\n\nUSER REQUEST:\n${user}` }]
    : [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
}

async function callOpenAICompatible({ system, user, maxTokens }, c, baseUrl, key) {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  const isClaude = /claude/i.test(c.model);
  const payload = {
    model: c.model,
    response_format: { type: 'json_object' },
    messages: compatibleMessages({ system, user }, c),
  };
  // gpt-5.x and o-series only accept the DEFAULT temperature; older models take a custom one.
  const supportsTemp = !/^(gpt-5|o\d)/i.test(c.model);
  if (supportsTemp) payload.temperature = 0.9;
  if (maxTokens) {
    const tokenLimit = Math.max(256, Math.min(Number(maxTokens) || 1500, 8000));
    if (supportsTemp || isClaude) payload.max_tokens = tokenLimit;
    else payload.max_completion_tokens = tokenLimit;
  }
  if (c.reasoningEffort) payload.reasoning_effort = c.reasoningEffort;

  const call = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  let res = await call();
  if (!res.ok) {
    let txt = await res.text().catch(() => '');
    // Retry once, stripping whichever param the endpoint rejected. Claude-via-proxy often
    // rejects response_format and/or reasoning_effort — drop them and rely on prompt+parseJson.
    let retried = false;
    if (payload.temperature !== undefined && /temperature/i.test(txt)) { delete payload.temperature; retried = true; }
    if (/response_format/i.test(txt)) { delete payload.response_format; retried = true; }
    if (payload.reasoning_effort !== undefined && /reasoning_effort|reasoning|effort/i.test(txt)) { delete payload.reasoning_effort; retried = true; }
    if ((payload.max_tokens !== undefined || payload.max_completion_tokens !== undefined) && /max[_ ]?(completion[_ ]?)?tokens/i.test(txt)) {
      delete payload.max_tokens; delete payload.max_completion_tokens; retried = true;
    }
    if (retried) {
      res = await call();
    }
    if (!res.ok) { txt = await res.text().catch(() => ''); throw new Error(`Model ${res.status}: ${txt.slice(0, 300)}`); }
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}

async function callAnthropic({ system, user, maxTokens }, c) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: c.model.startsWith('claude') ? c.model : 'claude-sonnet-5',
      max_tokens: Math.max(256, Math.min(Number(maxTokens) || 1500, 8000)),
      temperature: 0.9,
      system: system + '\nReturn ONLY the JSON object, no prose, no code fences.',
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '{}';
}

export function parseJson(raw) {
  const source = String(raw || '').trim();
  try {
    return JSON.parse(source);
  } catch {
    for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === String.fromCharCode(34)) inString = false;
          continue;
        }
        if (char === String.fromCharCode(34)) { inString = true; continue; }
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(source.slice(start, index + 1)); }
          catch { break; }
        }
      }
    }
    throw new Error('Model did not return valid JSON.');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────────────
// Normalize one hook object. Different models label the fields differently — Claude tends to
// emit "hook" for the line, some emit "copy"/"line". Map any of them to our canonical shape so
// the A/B filter and the frontend always see `text`.
export function normalizeHook(h) {
  // Some models return each hook as a bare string instead of an object.
  if (typeof h === 'string') {
    const t = h.trim();
    return t ? { text: t, pattern: inferHookPattern(t), why: '', grade: '' } : null;
  }
  if (!h || typeof h !== 'object') return null;
  const text = h.text || h.hook || h.line || h.copy || h.headline;
  if (!text) return null;
  const normalizedText = String(text).trim();
  const suppliedPattern = String(h.pattern || h.structure || '').trim();
  return {
    text: normalizedText,
    pattern: suppliedPattern || inferHookPattern(normalizedText),
    why: h.why || h.reason || h.rationale || '',
    grade: String(h.grade || h.rating || '').trim().charAt(0).toUpperCase(),
  };
}

// Models (esp. Claude via proxy) rename the array key — "suggestedReframes", "suggestions" —
// and sometimes make it an array of strings. Find the first array whose items normalize,
// wherever it lands. Skip arrays that are clearly not hooks (issues/scores lists) by requiring
// most items to normalize.
function findHookArray(out) {
  if (!out || typeof out !== 'object') return [];
  for (const key of ['hooks', 'rewrites', 'results', 'items', 'suggestions']) {
    if (Array.isArray(out[key]) && out[key].some((x) => normalizeHook(x))) return out[key];
  }
  let best = [];
  for (const v of Object.values(out)) {
    if (!Array.isArray(v) || !v.length) continue;
    const hits = v.filter((x) => normalizeHook(x)).length;
    if (hits > best.length && hits >= Math.ceil(v.length / 2)) best = v;
  }
  return best;
}

export async function generateHooks({ brief, topic, seeds, liked, disliked, count = 6, mode = 'general' }) {
  const contentFirst = mode === 'contentFirst';
  const raw = await callModel({
    ...generatePrompt({ brief, topic, seeds, liked, disliked, count, mode }),
    ...(contentFirst ? { maxTokens: 2800 } : {}),
  });
  const out = parseJson(raw);
  // safety net: only surface A/B even if the model slips
  return findHookArray(out)
    .map(normalizeHook)
    .filter((h) => h
      && h.text
      && /^[AB]/.test(h.grade)
      && (!contentFirst || (h.pattern && h.why && lintHook(h.text, { brief, mode }).length === 0)))
    .slice(0, count);
}

export async function gradeHook({ brief, hook }) {
  const raw = await callModel(gradePrompt({ brief, hook }));
  const out = parseJson(raw);
  const rewrites = findHookArray(out)
    .map((r) => {
      const n = normalizeHook(r);
      return n ? { text: n.text, why: n.why } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  const gradeRaw = String(out.grade || out.rating || out.score || '?').trim();
  return {
    grade: /^[A-F]/i.test(gradeRaw) ? gradeRaw.charAt(0).toUpperCase() : '?',
    breakdown: out.breakdown || out.explanation || out.assessment || out.analysis || out.feedback || '',
    rewrites,
  };
}

export function modelInfo() {
  const c = cfg();
  return { provider: c.provider, model: c.model, openaiKey: !!c.openaiKey };
}

export function structuredModelOptions() {
  const c = cfg();
  const provider = process.env.STRUCTURED_MODEL_PROVIDER || (c.openaiKey ? 'openai' : c.provider);
  const model = process.env.STRUCTURED_MODEL_NAME || (provider === 'openai' ? 'gpt-4o' : c.model);
  return { provider, model };
}
