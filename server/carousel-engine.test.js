import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCarouselOutput, normalizeTasteList } from './carousel-engine.js';

const themes = [
  { id: 'real-life', label: 'Real Life' },
  { id: 'work-scenes', label: 'Work Scenes' },
  { id: 'sunsets', label: 'Sunsets' },
  { id: 'generic-lifestyle', label: 'Generic Lifestyle' },
];

function slide(role, index, overrides = {}) {
  return {
    role,
    text: `Clear slide ${index + 1} copy`,
    alt: `Alternate slide ${index + 1} copy`,
    themeId: index % 2 ? 'work-scenes' : 'real-life',
    visualKeywords: ['person', 'natural light'],
    visualReason: 'The scene directly reflects this story beat.',
    userAsset: index === 3,
    ...overrides,
  };
}

function candidate(hook = 'A specific hook people understand immediately') {
  return {
    label: 'Story concept',
    hook,
    pattern: 'specific story',
    why: 'The story is concrete and moves toward a useful payoff.',
    thesis: 'A clear beginning, tension, product moment, and resolution.',
    grade: 'A',
    caption: 'A useful caption. What would you try? #topic',
    slides: [
      slide('Hook', 0, { text: hook }),
      slide('Context', 1),
      slide('Tension', 2),
      slide('Product moment', 3),
      slide('Closer', 4),
    ],
  };
}

test('normalizes a valid carousel to the frontend contract', () => {
  const [carousel] = normalizeCarouselOutput({ carousels: [candidate()] }, { themes, count: 5 });
  assert.ok(carousel.id.startsWith('carousel-'));
  assert.equal(carousel.hook, carousel.slides[0].text);
  assert.equal(carousel.slides[0].role, 'Hook');
  assert.equal(carousel.slides[3].role, 'Product moment');
  assert.equal(carousel.slides[3].userAsset, true);
  assert.equal(carousel.slides.filter((item) => item.userAsset).length, 1);
  assert.deepEqual(Object.keys(carousel.slides[0]), [
    'role', 'text', 'alt', 'themeId', 'visualKeywords', 'visualReason', 'userAsset',
  ]);
});

test('rejects invalid product placement and unknown visual themes', () => {
  const wrongPlacement = candidate();
  wrongPlacement.slides[2].role = 'Product moment';
  wrongPlacement.slides[2].userAsset = true;
  wrongPlacement.slides[3].role = 'Story';
  wrongPlacement.slides[3].userAsset = false;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [wrongPlacement] }, { themes }), []);

  const unknownTheme = candidate();
  unknownTheme.slides[1].themeId = 'not-in-library';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [unknownTheme] }, { themes }), []);

  const ordinarySolutionRole = candidate();
  ordinarySolutionRole.slides[4].role = 'Solution';
  assert.equal(normalizeCarouselOutput({ carousels: [ordinarySolutionRole] }, { themes }).length, 1);

  const brochureCopy = candidate();
  brochureCopy.slides[4].text = 'Feel the difference and embrace your calm.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [brochureCopy] }, { themes }), []);

  const metaphorOnlySunset = candidate();
  metaphorOnlySunset.slides[4].themeId = 'sunsets';
  const [fixedVisual] = normalizeCarouselOutput({ carousels: [metaphorOnlySunset] }, { themes });
  assert.equal(fixedVisual.slides[4].themeId, 'generic-lifestyle');
});

test('deduplicates generated hooks and excludes prior taste hooks', () => {
  const repeated = candidate('A new exact hook');
  const output = { carousels: [repeated, candidate('A new exact hook'), candidate('Another exact hook')] };
  const result = normalizeCarouselOutput(output, { themes, excludedHooks: ['A prior hook'] });
  assert.deepEqual(result.map((item) => item.hook), ['A new exact hook', 'Another exact hook']);
  assert.deepEqual(normalizeCarouselOutput({ carousels: [candidate('A prior hook')] }, { themes, excludedHooks: ['A prior hook'] }), []);
  assert.deepEqual(normalizeCarouselOutput(output, { themes, allowedHooks: ['Another exact hook'] }).map((item) => item.hook), ['Another exact hook']);
});

test('taste summaries accept both compact objects and strings', () => {
  const taste = normalizeTasteList([
    'A hook saved from an older screen',
    { hook: 'A full saved post', pattern: 'list', slideRoles: ['Hook', 'Product moment'], themes: ['real-life'], story: 'Hook | tension | product | payoff' },
  ]);
  assert.equal(taste.length, 2);
  assert.equal(taste[0].hook, 'A hook saved from an older screen');
  assert.deepEqual(taste[1].themes, ['real-life']);
  assert.equal(taste[1].story, 'Hook | tension | product | payoff');
});
