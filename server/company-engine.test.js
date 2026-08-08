import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactCompany,
  extractLogo,
  isPrivateAddress,
  normalizeAudienceOutput,
  normalizeCompanyOutput,
  parseWebsiteUrl,
  readableWebsiteText,
} from './company-engine.js';

test('private and reserved network addresses are rejected', () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.2.4', '192.168.1.4', '169.254.1.1', '::1', 'fd00::1', '2001:db8::1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('website URL parsing accepts public web URLs only', () => {
  assert.equal(parseWebsiteUrl('example.com/path').toString(), 'https://example.com/path');
  assert.throws(() => parseWebsiteUrl('file:///etc/passwd'), /Only http and https/);
  assert.throws(() => parseWebsiteUrl('http://127.0.0.1'), /Private network/);
  assert.throws(() => parseWebsiteUrl('https://user:pass@example.com'), /credentials/);
});

test('readable text keeps page meaning and drops active page code', () => {
  const text = readableWebsiteText(`
    <html><head><title>Acme</title><meta name='description' content='A useful service'></head>
    <body><script>ignore me</script><h1>Clear headline</h1><p>Real product details.</p></body></html>
  `);
  assert.match(text, /Title: Acme/);
  assert.match(text, /A useful service/);
  assert.match(text, /Clear headline/);
  assert.doesNotMatch(text, /ignore me/);
});

test('company output is normalized to the frontend brand contract', () => {
  const company = normalizeCompanyOutput({ company: {
    brandName: 'Acme',
    oneLiner: 'A useful product for busy teams.',
    targetAudience: 'Small teams with too much manual work.',
    tone: ['direct', 'warm'],
    visualStyle: ['editorial', 'bright'],
    category: 'Productivity',
  } }, { finalUrl: 'https://www.example.com/', context: 'Focus on founder stories.' });
  assert.equal(company.name, 'Acme');
  assert.equal(company.domain, 'example.com');
  assert.equal(company.product, company.oneLiner);
  assert.deepEqual(company.voice, ['direct', 'warm']);
  assert.deepEqual(company.look, ['editorial', 'bright']);
  assert.equal(company.context, 'Focus on founder stories.');
  assert.deepEqual(company.audience_intel.pains, []);
});

test('logo extraction prefers square marks and resolves them absolutely', () => {
  const html = `<html><head>
    <meta property='og:image' content='https://cdn.example.com/card.png'>
    <link rel='icon' href='/favicon-32.png' sizes='32x32'>
    <link rel='apple-touch-icon' href='/touch-180.png' sizes='180x180'>
  </head><body></body></html>`;
  assert.equal(extractLogo(html, 'https://example.com/pricing'), 'https://example.com/touch-180.png');

  // No declared icons: fall back to the social card, then to the conventional favicon path.
  assert.equal(
    extractLogo(`<meta property='og:image' content='//cdn.example.com/card.png'>`, 'https://example.com/'),
    'https://cdn.example.com/card.png',
  );
  assert.equal(extractLogo('<html></html>', 'https://example.com/'), 'https://example.com/favicon.ico');
  // A private-network icon href is skipped, not returned.
  assert.equal(
    extractLogo(`<link rel='icon' href='http://127.0.0.1/logo.png'>`, 'https://example.com/'),
    'https://example.com/favicon.ico',
  );
});

test('audience output tolerates loose model shapes and drops duplicates', () => {
  const audience = normalizeAudienceOutput({ audience: {
    pains: [
      { label: 'Emotional exhaustion', tell: 'You stop replying to people you care about.', cost: 'You feel further away.' },
      'Overthinking at night',
      { pain: 'emotional exhaustion' },
      { tell: 'no label so it is dropped' },
    ],
    myths: ['Rest has to be earned', 'Rest has to be earned'],
    vocabulary: ['drained', 'fine, i guess'],
    habit: 'a two-minute check-in before bed',
    plug: 'i use it to hear what i actually feel',
    never: 'no medical or clinical claims',
  } });
  assert.deepEqual(audience.pains.map((pain) => pain.label), ['Emotional exhaustion', 'Overthinking at night']);
  assert.equal(audience.pains[0].pinned, false);
  assert.equal(audience.pains[1].tell, '');
  assert.deepEqual(audience.beliefs, ['Rest has to be earned']);
  assert.deepEqual(audience.words, ['drained', 'fine, i guess']);
  assert.equal(audience.habit, 'a two-minute check-in before bed');
  assert.equal(audience.plugLine, 'i use it to hear what i actually feel');
  assert.equal(audience.avoid, 'no medical or clinical claims');
  assert.equal(normalizeAudienceOutput({ audience: { pains: [] } }), null);
  assert.equal(normalizeAudienceOutput('nonsense'), null);
});

test('a hand-edited brief is bounded before it is sent back to the model', () => {
  const compact = compactCompany({ name: 'A'.repeat(400), product: 'p', voice: ['calm', 'calm', 'warm'], junk: 'x' });
  assert.equal(compact.name.length, 120);
  assert.deepEqual(compact.voice, ['calm', 'warm']);
  assert.equal('junk' in compact, false);
  assert.equal(compactCompany({}), null);
  assert.equal(compactCompany(null), null);
});
