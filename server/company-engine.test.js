import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateAddress,
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
});
