import { chromium } from 'file:///C:/tmp/fastlane-playwright/node_modules/playwright/index.mjs';
import { mkdir, readFile, rename, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDirectory = 'C:/Users/Dan/Desktop/content-engine/content-engine/scraped-images';
const allSets = [
  'Airport Aesthetic', 'Animals', 'Art', 'Artificial Intelligence (AI)', 'Athletic',
  'Beauty', 'Black and White', 'Cars', 'Christmas', 'Coding / Developer',
  'College/University', 'Concerts', 'Crypto', 'Discipline / Habits', 'Dogs',
  'Entrepreneur / Hustle', 'Faceless Selfies', 'Fashion', 'Female Aesthetics',
  'Female Selfies', 'Food / Cooking', 'Friendship / Community', 'Gaming',
  'General Aesthetics', 'Generic Lifestyle', 'Golf', 'Gym', 'Home / Decor / Interior Design',
  'Journalling', 'Low Exposure Aesthetics', 'Luxury', 'Male Aesthetics', 'Male Selfies',
  'Music/Instruments', 'Nature', 'Nutrition', 'Parenting / Family', 'Philosophy',
  'Reading / Books', 'Relationship / Couples', 'Running', 'Self Care / Wellness',
  'Spirituality', 'Sports / Fitness', 'Study / Productivity', 'Sunsets',
  'Surrealist Art', 'Travel Scenery', 'Wealth', 'Work / Career',
];

const directoryFor = (name) => name
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

async function existingManifest(directory) {
  try {
    return JSON.parse(await readFile(path.join(directory, 'sources.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function downloadAll(page, images, directory) {
  await mkdir(directory, { recursive: true });
  const queue = images.map((image, index) => ({ image, index }));
  const workers = Array.from({ length: Math.min(10, queue.length) }, async () => {
    while (queue.length) {
      const { image, index } = queue.shift();
      const filename = `${String(index + 1).padStart(3, '0')}.jpg`;
      const output = path.join(directory, filename);
      const temporary = `${output}.part`;
      const response = await page.request.get(image.url, { timeout: 45_000 });
      if (!response.ok()) throw new Error(`Download failed (${response.status()}): ${image.url}`);
      await writeFile(temporary, await response.body());
      await rename(temporary, output);
      image.filename = filename;
    }
  });
  await Promise.all(workers);
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
try {
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('app.usefastlane.ai'));
  if (!page) throw new Error('Fastlane page was not found.');

  if (!(await page.locator('body').innerText()).includes('50 sets available')) {
    await page.getByText('Swap Image', { exact: true }).click();
    await page.getByText('All Sets', { exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('50 sets available'));
  }

  for (const name of allSets) {
    const directory = path.join(rootDirectory, directoryFor(name));
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForFunction((setName) => {
      const count = Number(document.body.innerText.match(/(\d+) images in set/)?.[1]);
      return Number.isInteger(count)
        && [...document.images].filter((image) => image.alt.startsWith(`${setName} `)).length === count;
    }, name, { timeout: 45_000 });

    const expectedCount = Number((await page.locator('body').innerText()).match(/(\d+) images in set/)?.[1]);
    const images = await page.locator('img[alt]').evaluateAll((elements, setName) => elements
      .filter((image) => image.alt.startsWith(`${setName} `))
      .map((image) => ({ alt: image.alt, url: image.currentSrc || image.src })), name);
    if (images.length !== expectedCount) throw new Error(`${name}: expected ${expectedCount}, found ${images.length}`);

    const manifest = await existingManifest(directory);
    if (manifest?.set === name && manifest.images?.length === expectedCount) {
      console.log(`${name}: already downloaded (${expectedCount})`);
    } else {
      await downloadAll(page, images, directory);
      await writeFile(path.join(directory, 'sources.json'), `${JSON.stringify({ set: name, images }, null, 2)}\n`);
      console.log(`${name}: downloaded ${expectedCount}`);
    }

    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('50 sets available'));
  }
} finally {
  await browser.close();
}
