import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_FIRST_REFERENCE,
  compatibleMessages,
  generatePrompt,
  hasRepayableDebt,
  inferHookPattern,
  lintHook,
  normalizeHook,
  parseJson,
  promisedListCount,
} from './hook-engine.js';

test('parses a JSON object wrapped in prose or a code fence', () => {
  const json = JSON.stringify({ ok: true });
  assert.deepEqual(parseJson(`Result:\n\`\`\`json\n${json}\n\`\`\``), { ok: true });
});

test('ignores unrelated braces before the first valid JSON object', () => {
  const json = JSON.stringify({ company: { name: 'Acme' } });
  assert.deepEqual(parseJson(`notes {not json} then ${json} trailing`), { company: { name: 'Acme' } });
});

test('never upgrades missing grades or bare strings to A', () => {
  assert.equal(normalizeHook('A bare hook string').grade, '');
  assert.equal(normalizeHook({ text: 'An object without a grade' }).grade, '');
  assert.equal(normalizeHook({ text: 'A genuinely graded hook', grade: 'B' }).grade, 'B');
});

test('infers stable canonical patterns without weakening the other quality fields', () => {
  assert.equal(inferHookPattern(`5 things you didn't realize were draining your focus`), 'blind-spot list');
  assert.equal(inferHookPattern('How to make Sunday night feel lighter before work:'), 'searchable how-to');
  assert.equal(inferHookPattern('How I stopped carrying every unfinished task into bed'), 'first-person story');
  assert.equal(inferHookPattern('For the ones who answer everyone before checking on themselves'), 'identity recognition');
  assert.equal(inferHookPattern(`Rest isn't laziness. The real problem starts before you stop.`), 'contrarian reframe');
  assert.equal(inferHookPattern('When the quiet part of the day becomes the heaviest'), 'editorial story');

  const normalized = normalizeHook({
    hook: `5 things you didn't realize were draining your focus`,
    grade: 'A',
    why: 'The list repays five concrete blind spots.',
  });
  assert.equal(normalized.pattern, 'blind-spot list');
  assert.equal(normalized.grade, 'A');
  assert.ok(normalized.why);
  assert.equal(normalizeHook({ hook: normalized.text, why: normalized.why }).grade, '');
  assert.equal(normalizeHook({ hook: normalized.text, grade: 'A' }).why, '');
});

test('content-first linter rejects taglines, product propositions, and dynamic brand names', () => {
  const brief = { name: 'Kokoro', domain: 'kokoromind.com' };
  const vanilla = `Say what's on your mind. We'll turn it into meditation made only for you.`;
  assert.ok(lintHook(vanilla, { brief, mode: 'contentFirst' }).length >= 2);
  assert.ok(lintHook('5 Kokoro habits nobody tells you about', { brief, mode: 'contentFirst' })
    .includes('names the brand on slide one'));
  assert.ok(lintHook('How to make Sunday night feel less heavy before work:', { brief, mode: 'contentFirst' }).length === 0);
  assert.ok(lintHook(`5 things you didn't realize were making Sunday night feel heavier`, { brief, mode: 'contentFirst' }).length === 0);
});

test('repayable debt is structural instead of a loose keyword match', () => {
  assert.equal(hasRepayableDebt('When life gets heavy, remember to keep going.'), false);
  assert.equal(hasRepayableDebt(`5 quiet signs you didn't realize were draining your focus`), true);
  assert.equal(hasRepayableDebt('How to stop reopening the team chat after 10 p.m.'), true);
  assert.equal(hasRepayableDebt(`The house is finally quiet. Your head didn't get the memo.`), true);
  assert.equal(hasRepayableDebt(`You're not tired. You're just still holding things nobody handed back.`), true);
  assert.equal(hasRepayableDebt('Nobody knows what would actually help you right now.'), true);
  assert.equal(hasRepayableDebt('What changed after I stopped answering email in bed?'), true);
});

test('list promises fit the carousel and first-person stories require a supplied source', () => {
  assert.equal(promisedListCount('7 things you did today that nobody thanked you for'), 7);
  assert.equal(promisedListCount(`Five quiet signs you didn't realize were draining your focus`), 5);
  assert.ok(lintHook('7 things you did today that nobody thanked you for', {
    brief: {},
    mode: 'contentFirst',
  }).includes('promises more list items than this carousel can repay'));
  assert.ok(lintHook('How I stopped reopening work chat after midnight', {
    brief: { context: 'Write useful posts about after-hours work.' },
    mode: 'contentFirst',
  }).includes('uses a first-person story that is not supplied in the brand context'));
  assert.deepEqual(lintHook('How I stopped reopening work chat after midnight', {
    brief: { context: 'I used to reopen work chat after midnight and stopped doing it.' },
    mode: 'contentFirst',
  }), []);
});

test('content-first brand protection parses www domains without treating common words as brands', () => {
  const fromDomain = lintHook('5 Northstar habits nobody told you were stealing an hour', {
    brief: { domain: 'https://www.northstar.example/path' },
    mode: 'contentFirst',
  });
  assert.ok(fromDomain.includes('names the brand on slide one'));

  for (const name of ['One', 'Every', 'Calm']) {
    const reasons = lintHook('How to stay calm when every unfinished task feels like one more job', {
      brief: { name, domain: `https://www.${name.toLowerCase()}.example` },
      mode: 'contentFirst',
    });
    assert.ok(!reasons.includes('names the brand on slide one'));
  }
});

test('editorial help language is allowed unless a product subject owns the proposition', () => {
  const brief = { name: 'Northstar', domain: 'https://www.northstar.example' };
  assert.deepEqual(lintHook('Nobody knows what would actually help you right now.', {
    brief,
    mode: 'contentFirst',
  }), []);
  assert.ok(lintHook('What would Northstar help you notice before bed?', {
    brief,
    mode: 'contentFirst',
  }).includes('reads like a product proposition'));
});

test('content-first prompt carries only the trusted reference strategy and hard editorial rules', () => {
  const prompt = generatePrompt({
    brief: { name: 'Tenant', product: 'A private tool', audience: 'people carrying invisible work' },
    topic: 'Audience tension: invisible work after a long day',
    count: 3,
    mode: 'contentFirst',
  });
  assert.ok(prompt.system.includes(CONTENT_FIRST_REFERENCE));
  assert.match(prompt.system, /Never name the brand, app, product, feature, tool, CTA/i);
  assert.match(prompt.system, /CONCRETE CURIOSITY DEBT/);
  assert.match(prompt.system, /at least 2 bounded-count list hooks/i);
  assert.match(prompt.system, /at least\s+2 HOW TO hooks/i);
  assert.match(prompt.system, /Never invent a founder, customer, or narrator anecdote/i);
  assert.match(prompt.system, /up to 9 hooks/i);
  assert.match(prompt.user, /Keep slide one product-free/);
  assert.doesNotMatch(CONTENT_FIRST_REFERENCE, /Kokoro|HealthMeter|Vent Now/i);
});

test('Claude-compatible proxies receive the trusted strategy in the visible request', () => {
  const proxy = compatibleMessages({ system: 'STRICT SCHEMA', user: 'RUNTIME PACKET' }, {
    provider: 'proxy',
    model: 'claude-opus',
  });
  assert.equal(proxy.length, 1);
  assert.equal(proxy[0].role, 'user');
  assert.match(proxy[0].content, /TRUSTED SYSTEM INSTRUCTIONS:\nSTRICT SCHEMA/);
  assert.match(proxy[0].content, /USER REQUEST:\nRUNTIME PACKET/);

  const openai = compatibleMessages({ system: 'STRICT SCHEMA', user: 'RUNTIME PACKET' }, {
    provider: 'openai',
    model: 'gpt-5.6-sol',
  });
  assert.deepEqual(openai.map((message) => message.role), ['system', 'user']);
});
