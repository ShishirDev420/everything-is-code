const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'profile.config.json');
const BROWSER_DATA_DIR = path.join(__dirname, '.browser-data');
const SNAPSHOT_PATH = path.join(__dirname, 'profile-snapshot.txt');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

async function waitForManualLoginIfNeeded(page, profileUrl) {
  let url = page.url();
  if (!url.includes('/login') && !url.includes('/checkpoint') && !url.includes('/uas/')) return;

  console.log('\nLinkedIn needs you to finish login/security verification in the browser.');
  console.log('Once your profile page loads, this script will continue automatically.\n');

  await page.waitForURL(/linkedin\.com\/(in|feed)\//, { timeout: 300000 }).catch(() => {});
  if (!page.url().includes('/in/')) {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  url = page.url();
  if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/uas/')) {
    throw new Error('Still on LinkedIn login/security page. Please complete login in the opened browser and run npm run snapshot again.');
  }
}

async function expandVisibleSeeMoreButtons(page) {
  for (let pass = 0; pass < 4; pass++) {
    const buttons = await page.locator('button:has-text("See more"), button:has-text("see more")').all();
    if (!buttons.length) return;

    for (const button of buttons.slice(0, 12)) {
      await button.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

async function main() {
  const config = loadConfig();
  const profileUrl = config.profileUrl || 'https://www.linkedin.com/in/shishir-kamble-73713b99/';

  console.log('Opening LinkedIn profile snapshot browser...');

  const browser = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await waitForManualLoginIfNeeded(page, profileUrl);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await expandVisibleSeeMoreButtons(page);

    const snapshot = await page.evaluate(() => {
      const clean = value => value.replace(/\s+/g, ' ').trim();
      const main = document.querySelector('main') || document.body;
      const sections = Array.from(main.querySelectorAll('section'))
        .map(section => clean(section.innerText || ''))
        .filter(Boolean);

      return {
        url: window.location.href,
        title: document.title,
        text: clean(main.innerText || document.body.innerText || ''),
        sections,
      };
    });

    const body = [
      `URL: ${snapshot.url}`,
      `TITLE: ${snapshot.title}`,
      '',
      'VISIBLE PROFILE TEXT',
      '====================',
      snapshot.text,
      '',
      'SECTIONS',
      '========',
      ...snapshot.sections.map((section, index) => `\n--- SECTION ${index + 1} ---\n${section}`),
      '',
    ].join('\n');

    fs.writeFileSync(SNAPSHOT_PATH, body, 'utf-8');
    console.log(`Saved profile snapshot to: ${SNAPSHOT_PATH}`);
    console.log('Leave the browser open if you want to review it; closing in 5 seconds.');
    await page.waitForTimeout(5000);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
