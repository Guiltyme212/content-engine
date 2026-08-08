import test from 'node:test';
import assert from 'node:assert/strict';
import { carouselPrompt, compactBrief, editorialTopic, explainProductCameo, normalizeCarouselOutput, normalizeTasteList } from './carousel-engine.js';

const themes = [
  { id: 'real-life', label: 'Real Life' },
  { id: 'work-scenes', label: 'Work Scenes' },
  { id: 'sunsets', label: 'Sunsets' },
  { id: 'generic-lifestyle', label: 'Generic Lifestyle' },
];

const brief = {
  name: 'Northstar',
  domain: 'northstar.example',
  product: 'A private journaling app that turns a voice note into a saved reflection.',
  audience: 'busy people who keep carrying unfinished thoughts into the evening',
  niche: 'reflective wellbeing',
};

const options = (extra = {}) => ({ themes, brief, ...extra });

function slide(role, index, overrides = {}) {
  return {
    role,
    text: index === 3
      ? 'I use Northstar to record one voice note about the thought.'
      : `This concrete story beat continues the promised list clearly ${index + 1}.`,
    alt: index === 3
      ? 'I open Northstar and record one voice note about the thought.'
      : `This alternate story beat continues the promised list clearly ${index + 1}.`,
    themeId: index % 2 ? 'work-scenes' : 'real-life',
    visualKeywords: ['person', 'natural light'],
    visualReason: 'The scene directly reflects this story beat.',
    userAsset: index === 3,
    ...overrides,
  };
}

function candidate(hook = 'How to stop carrying unfinished thoughts into the evening') {
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
  const [carousel] = normalizeCarouselOutput({ carousels: [candidate()] }, options({ count: 5 }));
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
  assert.deepEqual(normalizeCarouselOutput({ carousels: [wrongPlacement] }, options()), []);

  const unknownTheme = candidate();
  unknownTheme.slides[1].themeId = 'not-in-library';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [unknownTheme] }, options()), []);

  const ordinarySolutionRole = candidate();
  ordinarySolutionRole.slides[4].role = 'Solution';
  assert.equal(normalizeCarouselOutput({ carousels: [ordinarySolutionRole] }, options()).length, 1);

  const brochureCopy = candidate();
  brochureCopy.slides[4].text = 'Feel the difference and embrace your calm.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [brochureCopy] }, options()), []);

  const metaphorOnlySunset = candidate();
  metaphorOnlySunset.slides[4].themeId = 'sunsets';
  const [fixedVisual] = normalizeCarouselOutput({ carousels: [metaphorOnlySunset] }, options());
  assert.equal(fixedVisual.slides[4].themeId, 'generic-lifestyle');
});

test('deduplicates generated hooks and excludes prior taste hooks', () => {
  const repeatedHook = 'How to spot the moment your focus starts slipping before lunch';
  const otherHook = `How to make Sunday night feel lighter before work:`;
  const priorHook = `3 quiet habits nobody tells you are draining your focus`;
  const repeated = candidate(repeatedHook);
  const output = { carousels: [repeated, candidate(repeatedHook), candidate(otherHook)] };
  const result = normalizeCarouselOutput(output, options({ excludedHooks: [priorHook] }));
  assert.deepEqual(result.map((item) => item.hook), [repeatedHook, otherHook]);
  assert.deepEqual(normalizeCarouselOutput({ carousels: [candidate(priorHook)] }, options({ excludedHooks: [priorHook] })), []);
  assert.deepEqual(normalizeCarouselOutput(output, options({ allowedHooks: [otherHook] })).map((item) => item.hook), [otherHook]);
  assert.equal(normalizeCarouselOutput({ batch: [candidate(otherHook)] }, options()).length, 1);
});

test('editorial topic defaults to audience tension, never the product description', () => {
  const topic = editorialTopic({
    audience: 'night-shift workers who cannot switch off after work',
    product: 'A payroll automation dashboard with instant reporting',
    niche: 'workplace wellbeing',
  });
  assert.match(topic, /night-shift workers/i);
  assert.match(topic, /workplace wellbeing/i);
  assert.doesNotMatch(topic, /payroll automation|instant reporting/i);
});

test('rejects vanilla hooks and promotional language outside the product cameo', () => {
  const vanilla = candidate(`Say what's on your mind. We'll turn it into meditation made only for you.`);
  assert.deepEqual(normalizeCarouselOutput({ carousels: [vanilla] }, options()), []);

  const earlyBrand = candidate();
  earlyBrand.slides[1].text = 'Northstar turns the thought into a private reflection for you.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [earlyBrand] }, options()), []);

  const lateApp = candidate();
  lateApp.slides[4].text = 'Download the app now so you can finally feel calm.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [lateApp] }, options()), []);

  const promotionalAlt = candidate();
  promotionalAlt.slides[2].alt = 'Use the Northstar app to turn the whole day around.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [promotionalAlt] }, options()), []);

  const promotionalCaption = candidate();
  promotionalCaption.caption = 'Download Northstar now and get started today. #reflection';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [promotionalCaption] }, options()), []);
});

test('requires a subtle personal-tool cameo and useful content after it', () => {
  const hardSell = candidate();
  hardSell.slides[3].text = 'Download Northstar now and start your life-changing journey.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [hardSell] }, options()), []);

  const impersonal = candidate();
  impersonal.slides[3].text = 'Northstar is a private tool for writing thoughts down.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [impersonal] }, options()), []);

  const repeatedBrand = candidate();
  repeatedBrand.slides[3].text = 'I use Northstar to write a thought down. Northstar keeps the note private.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [repeatedBrand] }, options()), []);

  const noValueAfter = candidate();
  noValueAfter.slides[4].text = 'You are enough.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [noValueAfter] }, options()), []);

  assert.equal(normalizeCarouselOutput({ carousels: [candidate()] }, options()).length, 1);
});

test('a bounded-list carousel must deliver every numbered item it promises', () => {
  const hook = `5 quiet signs you didn't realize were draining your focus`;
  const complete = candidate(hook);
  complete.slides = [
    slide('Hook', 0, { text: hook }),
    slide('Story beat', 1, { text: '1. You reopen the same message before breakfast.' }),
    slide('Story beat', 2, { text: '2. You move one unfinished task onto three new lists.' }),
    slide('Product moment', 3),
    slide('Story beat', 4, { text: '3. You check the clock before you check how you feel.' }),
    slide('Story beat', 5, { text: '4. You reread the note after the decision is already made.' }),
    slide('Story beat', 6, { text: '5. You close the laptop but leave the inbox open on your phone.' }),
  ];
  assert.equal(normalizeCarouselOutput({ carousels: [complete] }, options()).length, 1);

  const incomplete = structuredClone(complete);
  incomplete.slides[6].text = 'You close the laptop but leave the inbox open on your phone.';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [incomplete] }, options()), []);
});

test('rejects personal-sounding product pitches, outcome claims, and abstract body copy', () => {
  const personalPitch = candidate();
  personalPitch.slides[3].text = 'I use Northstar because it turns whatever I say into meditation made only for me.';
  personalPitch.slides[3].alt = personalPitch.slides[3].text;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [personalPitch] }, options()), []);

  const outcomeClaim = candidate();
  outcomeClaim.slides[3].text = 'I open Northstar and it calms my mind before bed.';
  outcomeClaim.slides[3].alt = outcomeClaim.slides[3].text;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [outcomeClaim] }, options()), []);

  const inventedBehavior = candidate();
  inventedBehavior.slides[3].text = 'I use Northstar to reshape whatever I am thinking before bed.';
  inventedBehavior.slides[3].alt = inventedBehavior.slides[3].text;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [inventedBehavior] }, options()), []);

  const kokoroBrief = {
    ...brief,
    name: 'Kokoro',
    domain: 'kokoro.app',
    product: 'An app where people speak what is on their mind and receive a meditation for that moment.',
  };
  const supportedParaphrase = candidate();
  supportedParaphrase.slides[3].text = 'I open Kokoro and say the thought out loud.';
  supportedParaphrase.slides[3].alt = 'I say the thought out loud into Kokoro.';
  assert.equal(normalizeCarouselOutput({ carousels: [supportedParaphrase] }, options({ brief: kokoroBrief })).length, 1);

  const vagueOutput = structuredClone(supportedParaphrase);
  vagueOutput.slides[3].text = 'I speak into Kokoro and it hands the thought back shaped differently.';
  vagueOutput.slides[3].alt = vagueOutput.slides[3].text;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [vagueOutput] }, options({ brief: kokoroBrief })), []);

  const abstractBody = candidate();
  abstractBody.slides[2].text = 'Each worry becomes an emotional storm in the silence.';
  abstractBody.slides[2].alt = abstractBody.slides[2].text;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [abstractBody] }, options()), []);

  const genericCaption = candidate();
  genericCaption.caption = 'Let us explore the burdens we carry. Ever feel this way?';
  assert.deepEqual(normalizeCarouselOutput({ carousels: [genericCaption] }, options()), []);
});

test('allows natural editorial help language and common-word brand vocabulary', () => {
  const naturalQuestion = candidate();
  naturalQuestion.caption = 'What helps you notice this before bed? #reflection';
  assert.equal(normalizeCarouselOutput({ carousels: [naturalQuestion] }, options()).length, 1);

  for (const name of ['One', 'Every', 'Calm']) {
    const commonWord = candidate('How to stay calm when every unfinished task feels like one more job');
    commonWord.slides[3].text = 'I use this private tool to record one voice note.';
    commonWord.slides[3].alt = 'I keep this private tool for recording one voice note.';
    const commonBrief = { ...brief, name, domain: `https://www.${name.toLowerCase()}.example` };
    assert.equal(normalizeCarouselOutput({ carousels: [commonWord] }, options({ brief: commonBrief })).length, 1);
  }
});

test('carousel prompt demands observable receipts and a neutral product cameo', () => {
  const prompt = carouselPrompt({
    brand: brief,
    themes,
    liked: [],
    disliked: [],
    approvedHooks: [{ text: '5 quiet signs nobody warned you about', grade: 'A' }],
    count: 1,
  });
  assert.match(prompt.system, /BODY SLIDES ARE RECEIPTS/i);
  assert.match(prompt.system, /observable\s+action, object, time, place, message, quote, or decision/i);
  assert.match(prompt.system, /BAD COPY: Each worry grows larger/i);
  assert.match(prompt.system, /Never use because, so I can, made for me/i);
  assert.match(prompt.system, /Reuse at least one capability noun, verb, or direct grammatical form/i);
  assert.match(prompt.system, /Ask one exact, answerable question/i);
  assert.match(prompt.system, /Write the cover and complete story TOGETHER/i);
  assert.match(prompt.system, /A1 THE ROUTINE/i);
  assert.match(prompt.system, /A2 THE MIRROR/i);
  assert.match(prompt.system, /A3 THE DIARY/i);
  assert.match(prompt.system, /Use slide 4 for 5-7-slide A1\/A2 carousels and slide 6 for an 8-slide A3 diary/i);
  assert.match(prompt.system, /REAL candid human library photo/i);
  assert.doesNotMatch(prompt.system, /previous response failed|unnumbered product interruption/i);
});

test('an eight-slide A3 diary keeps its numbered shape and uses slide six for the cameo', () => {
  const hook = 'how i stopped taking unfinished work to bed after one brutal year';
  const personalBrief = { ...brief, context: 'I spent a year carrying unfinished work into bed and changed my evening routine.' };
  const diary = candidate(hook);
  diary.structure = 'A3';
  diary.slides = [
    slide('Hook', 0, { text: hook }),
    slide('Story beat', 1, { text: '1. i closed the laptop at 8pm because the inbox never chose an ending.' }),
    slide('Story beat', 2, { text: '2. i left my phone in the kitchen so work stopped following me upstairs.' }),
    slide('Story beat', 3, { text: '3. i wrote one loose end on paper so my pillow stopped holding the list.', alt: '3. i put one loose end on paper so the list stayed off my pillow.', userAsset: false }),
    slide('Story beat', 4, { text: '4. i said the unfinished thought aloud because silence kept rehearsing it.' }),
    slide('Product moment', 5, { text: '5. i record one voice note in Northstar.', alt: '5. i leave one voice note in Northstar.', userAsset: true }),
    slide('Story beat', 6, { text: '6. i turned off the hall light because a dark room finally marked the day done.' }),
    slide('Closer', 7, { text: 'save this for the night your job tries to follow you into bed.' }),
  ];
  const [normalized] = normalizeCarouselOutput({ carousels: [diary] }, options({ brief: personalBrief }));
  assert.equal(normalized.structure, 'A3');
  assert.equal(normalized.slides[5].userAsset, true);

  const earlyCameo = structuredClone(diary);
  earlyCameo.slides[3].role = 'Product moment';
  earlyCameo.slides[3].userAsset = true;
  earlyCameo.slides[5].role = 'Story beat';
  earlyCameo.slides[5].userAsset = false;
  assert.deepEqual(normalizeCarouselOutput({ carousels: [earlyCameo] }, options({ brief: personalBrief })), []);
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

test('known pains aim the batch, and pinned pains win', () => {
  const withPains = {
    ...brief,
    audience_intel: {
      pains: [
        { label: 'Emotional exhaustion', tell: 'you stop replying to people you care about' },
        { label: 'Overthinking at night', pinned: true },
      ],
    },
  };
  const topic = editorialTopic(withPains);
  assert.match(topic, /the operator pinned these/);
  assert.match(topic, /Overthinking at night/);
  assert.doesNotMatch(topic, /Emotional exhaustion/);

  const unpinned = editorialTopic({ ...withPains, audience_intel: { pains: [{ label: 'Emotional exhaustion' }] } });
  assert.match(unpinned, /Emotional exhaustion/);
  assert.doesNotMatch(unpinned, /operator pinned/);

  // No audience layer: the topic keeps its original shape.
  assert.doesNotMatch(editorialTopic(brief), /known audience pains/);
});

test('the audience layer survives compaction into the model packet', () => {
  const brand = compactBrief({
    ...brief,
    audience_intel: {
      pains: [{ label: 'Emotional exhaustion', tell: 'you stop replying', cost: 'x'.repeat(400), pinned: true }, { junk: true }],
      words: ['drained'],
      habit: 'a two-minute check-in',
      avoid: 'no medical claims',
    },
  });
  assert.equal(brand.audience_intel.pains.length, 1);
  assert.equal(brand.audience_intel.pains[0].pinned, true);
  assert.equal(brand.audience_intel.pains[0].cost.length, 220);
  assert.deepEqual(brand.audience_intel.words, ['drained']);
  assert.equal(compactBrief(brief).audience_intel, null);

  const prompt = carouselPrompt({ brand, topic: editorialTopic(brief), themes, count: 2 });
  assert.match(prompt.user, /Emotional exhaustion/);
  assert.match(prompt.user, /no medical claims/);
});

test('a numbered product cameo may use its two allowed sentences', () => {
  // Regression: the cameo MUST keep its numbered beat prefix ("3. i ..."), but the sentence
  // count split on [.!?] treated that "3." as a sentence. A cameo using the two sentences the
  // prompt explicitly allows therefore measured as three and was rejected every time, so in
  // practice only a one-sentence comma-joined cameo could pass. This was the single largest
  // source of discarded carousels.
  const twoSentenceCameo = '3. I talk the whole day into Northstar. It turns my own words into a short reflection.';
  const withCameo = candidate('How to stop replaying the same evening conversation');
  withCameo.slides[3] = slide('Product moment', 3, { text: twoSentenceCameo, alt: twoSentenceCameo });
  const [carousel] = normalizeCarouselOutput({ carousels: [withCameo] }, options({ count: 1 }));
  assert.ok(carousel, 'a numbered two-sentence cameo should pass the publish checks');
  assert.equal(carousel.slides[3].text, twoSentenceCameo);
  assert.deepEqual(explainProductCameo(twoSentenceCameo, brief), []);
});

test('the cameo explainer names the condition that failed', () => {
  // Twelve conditions ANDed together report nothing useful when the answer is just false.
  const tooLong = '3. I talk the whole day into Northstar and it listens and then it turns my own words into a short saved reflection that I can play back later tonight.';
  assert.ok(explainProductCameo(tooLong, brief).some((reason) => /too long/.test(reason)));
  assert.ok(explainProductCameo('3. I open the thing.', brief).some((reason) => /product term/.test(reason)));
});

test('a pinned body shape carries its mechanical slide budget and cameo slot', () => {
  // Each parallel call is pinned to one shape, so the prompt must state that shape's exact
  // budget: the loose prose version kept producing carousels the validators rejected.
  const a3 = carouselPrompt({ brand: compactBrief(brief), themes, liked: [], disliked: [], count: 1, assignedShape: 'A3' });
  assert.match(a3.system, /PINNED TO BODY SHAPE A3/);
  assert.match(a3.system, /EXACTLY 8 slides/);
  assert.match(a3.system, /SLIDE 6 exactly/);
  assert.match(a3.system, /NEVER promise more than 5 items/);

  // No first-person experience in this brief, so a first-person cover cannot pass the lint.
  assert.match(a3.system, /cover must contain NO i \/ my \/ me/);
  const withStory = carouselPrompt({
    brand: compactBrief({ ...brief, context: 'i used to reopen the same message every night before bed' }),
    themes, liked: [], disliked: [], count: 1, assignedShape: 'A3',
  });
  assert.doesNotMatch(withStory.system, /cover must contain NO i \/ my \/ me/);

  // An unpinned batch prompt keeps the original plural framing.
  const batch = carouselPrompt({ brand: compactBrief(brief), themes, liked: [], disliked: [], count: 3 });
  assert.match(batch.system, /BUILD EXACTLY 3 DISTINCT CAROUSELS/);
  assert.doesNotMatch(batch.system, /PINNED TO BODY SHAPE/);
});
