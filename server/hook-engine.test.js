import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from './hook-engine.js';

test('parses a JSON object wrapped in prose or a code fence', () => {
  const json = JSON.stringify({ ok: true });
  assert.deepEqual(parseJson(`Result:\n\`\`\`json\n${json}\n\`\`\``), { ok: true });
});

test('ignores unrelated braces before the first valid JSON object', () => {
  const json = JSON.stringify({ company: { name: 'Acme' } });
  assert.deepEqual(parseJson(`notes {not json} then ${json} trailing`), { company: { name: 'Acme' } });
});
