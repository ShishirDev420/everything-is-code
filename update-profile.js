const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'profile.config.json');
const BROWSER_DATA_DIR = path.join(__dirname, '.browser-data');
const LINKEDIN_BASE = 'https://www.linkedin.com';

async function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function hasValue(val) {
  if (!val) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.keys(val).some(k => hasValue(val[k]));
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForLoggedIn(page) {
  for (let i = 0; i < 120; i++) {
    const url = page.url();
    if (url.includes('/feed') || url.includes('/in/')) return true;
    await sleep(2000);
  }
  return false;
}

async function ensureLoggedIn(page) {
  await page.goto(`${LINKEDIN_BASE}/feed`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await sleep(3000);

  if (page.url().includes('/feed') && !page.url().includes('login')) {
    console.log('Already logged in.\n');
    return true;
  }

  console.log('Not logged in. Opening LinkedIn login page...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });

  console.log('\n=== MANUAL LOGIN REQUIRED ===');
  console.log('Please log in to LinkedIn in the browser window.');
  console.log('Complete any 2FA or CAPTCHA challenges.');
  console.log('The script will auto-detect when you are logged in.');
  console.log('================================\n');

  const ok = await waitForLoggedIn(page);
  if (!ok) throw new Error('Login timeout - did not detect login after 4 minutes');
  console.log('Login detected. Continuing...\n');
}

async function navigateToProfile(page, profileUrl) {
  if (profileUrl) {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return;
  }

  // Try to find the "Me" menu and navigate to profile
  try {
    await page.goto(`${LINKEDIN_BASE}/feed`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    // Click "Me" nav button (usually has the user's avatar)
    const meButton = page.locator('[data-control-name="nav.me"]').or(
      page.locator('button:has(.global-nav__me-photo)')
    ).or(
      page.locator('button').filter({ has: page.locator('img[alt*="photo"]') })
    ).first();

    await meButton.click({ timeout: 5000 }).catch(() => {});
    await sleep(1000);

    // Click "View Profile"
    const viewProfile = page.getByRole('link', { name: /view profile/i }).or(
      page.getByText(/view profile/i)
    ).first();
    await viewProfile.click({ timeout: 5000 }).catch(() => {});
    await sleep(2000);
  } catch {
    console.log('Could not auto-navigate to profile.');
    console.log(`Please navigate to your profile manually: ${LINKEDIN_BASE}/in/your-username/`);
    console.log('Waiting 30 seconds...');
    await sleep(30000);
  }
}

async function clickEditButton(page, sectionName) {
  // Strategy 1: Look for a button inside the section heading
  const section = page.locator('section').filter({ hasText: new RegExp(sectionName, 'i') }).first();
  if (await section.count() > 0) {
    const editBtn = section.locator('button[aria-label*="Edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      return true;
    }
  }

  // Strategy 2: Look for a pencil button near the section heading text
  const heading = page.getByRole('heading', { name: new RegExp(sectionName, 'i') }).or(
    page.locator(`h2:has-text("${sectionName}"), h3:has-text("${sectionName}")`)
  ).first();

  if (await heading.count() > 0) {
    // Find edit button sibling or nearby
    const parent = heading.locator('..');
    const editBtn = parent.locator('button[aria-label*="Edit"], button[aria-label*="edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      return true;
    }
  }

  return false;
}

async function updateHeadline(page, headline) {
  console.log('[headline] Opening intro editor...');
  try {
    // Click the edit (pencil) icon on the intro card
    const introEdit = page.locator('button[aria-label*="Edit intro"]').or(
      page.locator('.pv-top-card-v2').locator('button[aria-label*="Edit"]')
    ).or(
      page.locator('[data-view-name="profile-top-card"]').locator('button[aria-label*="Edit"]')
    ).first();

    if (await introEdit.count() === 0) {
      console.log('  Could not find edit intro button. Trying alternative...');
      // Fallback: click any pencil button in the top card area
      const anyEdit = page.locator('main').locator('button[aria-label*="Edit"]').first();
      if (await anyEdit.count() === 0) throw new Error('No edit button found');
      await anyEdit.click();
    } else {
      await introEdit.click();
    }

    await sleep(2000);

    // Find headline input in the opened modal/dialog
    const headlineInput = page.locator('[role="dialog"]').locator('input[id*="headline" i], textarea[id*="headline" i], input[name*="headline" i]').or(
      page.locator('[role="dialog"]').locator('label:has-text("Headline") + input, label:has-text("Headline") + textarea')
    ).or(
      page.getByLabel(/headline/i)
    ).first();

    if (await headlineInput.count() === 0) {
      // Just use the first input/textarea in the dialog
      const firstField = page.locator('[role="dialog"]').locator('input, textarea').first();
      if (await firstField.count() === 0) throw new Error('No input field found in dialog');
      await firstField.click({ clickCount: 3 });
      await firstField.fill(headline);
    } else {
      await headlineInput.click({ clickCount: 3 });
      await headlineInput.fill(headline);
    }

    await sleep(500);

    // Click Save
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    await saveBtn.click();
    await sleep(2000);
    console.log('  Headline updated!\n');
  } catch (err) {
    console.log(`  Skipped: ${err.message}\n`);
  }
}

async function updateAbout(page, about) {
  console.log('[about] Updating About section...');
  try {
    // LinkedIn About section has an edit pencil near the "About" heading
    const aboutEdit = page.locator('button[aria-label*="Edit about"]').or(
      page.locator('section').filter({ hasText: /About/i }).locator('button[aria-label*="Edit"]')
    ).or(
      page.locator('#about').locator('..').locator('button[aria-label*="Edit"]')
    ).first();

    if (await aboutEdit.count() === 0) {
      // Try clicking the pencil in the about section
      const clicked = await clickEditButton(page, 'About');
      if (!clicked) throw new Error('Could not find About edit button');
    } else {
      await aboutEdit.click();
    }

    await sleep(2000);

    // The About editor is typically a contenteditable div or textarea
    const aboutField = page.locator('[role="dialog"]').locator('[contenteditable="true"]').or(
      page.locator('[role="dialog"]').locator('textarea')
    ).or(
      page.locator('[role="dialog"]').locator('.ql-editor')
    ).first();

    if (await aboutField.count() === 0) throw new Error('No about field found');
    await aboutField.click({ clickCount: 3 });
    await aboutField.fill(about);
    await sleep(500);

    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    await saveBtn.click();
    await sleep(2000);
    console.log('  About section updated!\n');
  } catch (err) {
    console.log(`  Skipped: ${err.message}\n`);
  }
}

async function updateCurrentPosition(page, position) {
  console.log('[currentPosition] Updating position...');
  try {
    // Click edit on the first (current) experience entry
    const expEdit = page.locator('#experience').locator('..').locator('button[aria-label*="Edit"]').or(
      page.locator('section').filter({ hasText: /Experience/i }).locator('button[aria-label*="Edit"]')
    ).first();

    if (await expEdit.count() === 0) {
      const clicked = await clickEditButton(page, 'Experience');
      if (!clicked) throw new Error('Could not find experience edit button');
    } else {
      await expEdit.click();
    }

    await sleep(2000);

    const dialog = page.locator('[role="dialog"]');

    if (position.title) {
      const titleField = dialog.locator('input[id*="title" i], input[name*="title" i]').or(
        dialog.getByLabel(/title/i)
      ).first();
      if (await titleField.count() > 0) {
        await titleField.click({ clickCount: 3 });
        await titleField.fill(position.title);
      }
    }

    if (position.company) {
      const companyField = dialog.locator('input[id*="company" i], input[name*="company" i]').or(
        dialog.getByLabel(/company/i)
      ).first();
      if (await companyField.count() > 0) {
        await companyField.click({ clickCount: 3 });
        await companyField.fill(position.company);
        await sleep(1000);
        // LinkedIn may show a dropdown for companies - click the first suggestion
        const firstSuggestion = dialog.locator('[role="listbox"], [role="option"]').first();
        if (await firstSuggestion.count() > 0) {
          await firstSuggestion.click().catch(() => {});
        }
      }
    }

    if (position.industry) {
      const industryField = dialog.locator('input[id*="industry" i]').or(
        dialog.getByLabel(/industry/i)
      ).first();
      if (await industryField.count() > 0) {
        await industryField.click({ clickCount: 3 });
        await industryField.fill(position.industry);
        await sleep(1000);
        const suggestion = dialog.locator('[role="listbox"], [role="option"]').first();
        if (await suggestion.count() > 0) await suggestion.click().catch(() => {});
      }
    }

    if (position.description) {
      const descField = dialog.locator('[contenteditable="true"], textarea').first();
      if (await descField.count() > 0) {
        await descField.click({ clickCount: 3 });
        await descField.fill(position.description);
      }
    }

    if (position.location) {
      const locField = dialog.locator('input[id*="location" i]').or(
        dialog.getByLabel(/location/i)
      ).first();
      if (await locField.count() > 0) {
        await locField.click({ clickCount: 3 });
        await locField.fill(position.location);
        await sleep(1000);
        const suggestion = dialog.locator('[role="listbox"], [role="option"]').first();
        if (await suggestion.count() > 0) await suggestion.click().catch(() => {});
      }
    }

    const saveBtn = dialog.getByRole('button', { name: /save/i }).first();
    await saveBtn.click();
    await sleep(2000);
    console.log('  Position updated!\n');
  } catch (err) {
    console.log(`  Skipped: ${err.message}\n`);
  }
}

async function addSkills(page, skills) {
  console.log('[skillsToAdd] Adding skills...');
  for (const skill of skills) {
    try {
      // Find "Add a new skill" button in the Skills section
      const addSkillBtn = page.getByRole('button', { name: /add.*skill/i }).or(
        page.locator('section').filter({ hasText: /Skills/i }).locator('button:has-text("Add")')
      ).or(
        page.locator('button[aria-label*="Add"]').filter({ hasText: /skill/i })
      ).first();

      if (await addSkillBtn.count() === 0) {
        // Try clicking into the skills section to reveal add button
        const skillsSection = page.locator('#skills').locator('..').locator('button[aria-label*="Edit"]').first();
        if (await skillsSection.count() > 0) {
          await skillsSection.click();
          await sleep(1500);
        }
      } else {
        await addSkillBtn.click();
      }

      await sleep(1500);

      // Type the skill name
      const skillInput = page.locator('[role="dialog"]').locator('input').or(
        page.locator('[role="dialog"]').locator('textarea')
      ).first();

      if (await skillInput.count() > 0) {
        await skillInput.fill(skill);
        await sleep(1500);
        // Select first suggestion
        const suggestion = page.locator('[role="listbox"]').locator('[role="option"]').first();
        if (await suggestion.count() > 0) await suggestion.click();
        await sleep(500);

        const saveBtn = page.getByRole('button', { name: /save|add/i }).first();
        if (await saveBtn.count() > 0) await saveBtn.click();
        await sleep(1000);
        console.log(`  Added skill: ${skill}`);
      }
    } catch (err) {
      console.log(`  Skipped skill "${skill}": ${err.message}`);
    }
  }
  console.log();
}

async function removeSkills(page, skills) {
  console.log('[skillsToRemove] Removing skills...');
  try {
    // Click the edit (pencil) button on the Skills section
    const skillsEdit = page.locator('#skills').locator('..').locator('button[aria-label*="Edit"]').or(
      page.locator('section').filter({ hasText: /Skills/i }).locator('button[aria-label*="Edit"]')
    ).first();

    if (await skillsEdit.count() === 0) {
      console.log('  Could not find skills edit button');
      return;
    }

    await skillsEdit.click();
    await sleep(2000);

    for (const skill of skills) {
      try {
        // In edit mode, skills have delete (trash) buttons
        const skillRow = page.locator('[role="dialog"]').locator('li, div').filter({ hasText: skill }).first();
        const deleteBtn = skillRow.locator('button[aria-label*="Delete"], button[aria-label*="Remove"]').first();
        if (await deleteBtn.count() > 0) {
          await deleteBtn.click();
          await sleep(500);
          console.log(`  Removed skill: ${skill}`);
        } else {
          console.log(`  Could not find skill to remove: ${skill}`);
        }
      } catch (err) {
        console.log(`  Skipped removing "${skill}": ${err.message}`);
      }
    }

    const saveBtn = page.getByRole('button', { name: /save|done/i }).first();
    if (await saveBtn.count() > 0) await saveBtn.click();
    await sleep(1500);
  } catch (err) {
    console.log(`  Skipped: ${err.message}`);
  }
  console.log();
}

async function updateContactInfo(page, contactInfo) {
  console.log('[contactInfo] Updating contact info...');
  try {
    // Click "Contact info" link in the intro section
    const contactLink = page.getByText(/contact info/i).filter({ hasText: /contact info/i }).or(
      page.locator('a[href*="contact-info"]')
    ).or(
      page.locator('span:has-text("Contact info")')
    ).first();

    if (await contactLink.count() === 0) {
      console.log('  Could not find Contact info link');
      return;
    }

    await contactLink.click();
    await sleep(1500);

    // In the contact info modal, click the edit (pencil) icon
    const editPencil = page.locator('[role="dialog"]').locator('button[aria-label*="Edit"], [aria-label*="edit"]').first();
    if (await editPencil.count() > 0) {
      await editPencil.click();
      await sleep(1500);
    }

    const dialog = page.locator('[role="dialog"]').last();

    if (contactInfo.email) {
      const emailField = dialog.locator('input[type="email"], input[id*="email" i]').first();
      if (await emailField.count() > 0) {
        await emailField.click({ clickCount: 3 });
        await emailField.fill(contactInfo.email);
      }
    }

    if (contactInfo.phone) {
      const phoneField = dialog.locator('input[type="tel"], input[id*="phone" i]').first();
      if (await phoneField.count() > 0) {
        await phoneField.click({ clickCount: 3 });
        await phoneField.fill(contactInfo.phone);
      }
    }

    if (contactInfo.website) {
      const websiteField = dialog.locator('input[type="url"], input[id*="website" i], input[id*="url" i]').first();
      if (await websiteField.count() > 0) {
        await websiteField.click({ clickCount: 3 });
        await websiteField.fill(contactInfo.website);
      }
    }

    const saveBtn = dialog.getByRole('button', { name: /save|apply/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await sleep(1500);
    }

    // Close the contact info modal
    const closeBtn = page.locator('[role="dialog"]').locator('button[aria-label*="Dismiss"], button[aria-label*="Close"]').first();
    if (await closeBtn.count() > 0) await closeBtn.click();
    await sleep(1000);

    console.log('  Contact info updated!\n');
  } catch (err) {
    console.log(`  Skipped: ${err.message}\n`);
  }
}

async function updateEducation(page, entries) {
  console.log('[education] Updating education...');
  try {
    const eduEdit = page.locator('#education').locator('..').locator('button[aria-label*="Edit"]').or(
      page.locator('section').filter({ hasText: /Education/i }).locator('button[aria-label*="Edit"]')
    ).first();

    if (await eduEdit.count() === 0) {
      const clicked = await clickEditButton(page, 'Education');
      if (!clicked) {
        console.log('  Could not find education edit button');
        return;
      }
    } else {
      await eduEdit.click();
    }
    await sleep(2000);

    for (const entry of entries) {
      try {
        // Click "Add education" button
        const addBtn = page.getByRole('button', { name: /add.*education/i }).or(
          page.locator('[role="dialog"]').locator('button:has-text("Add")')
        ).first();

        if (await addBtn.count() > 0) await addBtn.click();
        await sleep(1500);

        const dialog = page.locator('[role="dialog"]').last();

        if (entry.school) {
          const schoolField = dialog.locator('input[id*="school" i], input[name*="school" i]').or(
            dialog.getByLabel(/school/i)
          ).first();
          if (await schoolField.count() > 0) {
            await schoolField.fill(entry.school);
            await sleep(1000);
            const suggestion = dialog.locator('[role="listbox"] [role="option"]').first();
            if (await suggestion.count() > 0) await suggestion.click();
          }
        }

        if (entry.degree) {
          const degreeField = dialog.locator('input[id*="degree" i]').or(
            dialog.getByLabel(/degree/i)
          ).first();
          if (await degreeField.count() > 0) await degreeField.fill(entry.degree);
        }

        if (entry.fieldOfStudy) {
          const fieldField = dialog.locator('input[id*="field" i]').or(
            dialog.getByLabel(/field of study/i)
          ).first();
          if (await fieldField.count() > 0) await fieldField.fill(entry.fieldOfStudy);
        }

        const saveBtn = dialog.getByRole('button', { name: /save/i }).first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await sleep(1500);
        }
        console.log(`  Added education: ${entry.school || entry.degree || 'entry'}`);
      } catch (err) {
        console.log(`  Skipped education entry: ${err.message}`);
      }
    }
    console.log();
  } catch (err) {
    console.log(`  Skipped: ${err.message}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const loginOnly = args.includes('--login-only');

  console.log('LinkedIn Profile Updater');
  console.log('=======================');
  if (dryRun) console.log('[DRY RUN MODE - no changes will be made]\n');
  if (loginOnly) console.log('[LOGIN ONLY - will just log in and exit]\n');

  const config = await loadConfig();

  if (!dryRun && !loginOnly) {
    let hasUpdates = false;
    if (hasValue(config.headline)) hasUpdates = true;
    if (hasValue(config.about)) hasUpdates = true;
    if (hasValue(config.currentPosition)) hasUpdates = true;
    if (hasValue(config.education)) hasUpdates = true;
    if (hasValue(config.skillsToAdd)) hasUpdates = true;
    if (hasValue(config.skillsToRemove)) hasUpdates = true;
    if (hasValue(config.contactInfo)) hasUpdates = true;

    if (!hasUpdates) {
      console.log('No updates specified in profile.config.json');
      console.log('Edit profile.config.json to add content, then run again.');
      return;
    }
  }

  console.log('Launching browser...');

  const browser = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    await ensureLoggedIn(page);

    if (loginOnly) {
      console.log('Login complete. You can now run the updater.');
      return;
    }

    if (dryRun) {
      console.log('Dry run complete - logged in and ready.');
      return;
    }

    console.log('Navigating to profile...');
    await navigateToProfile(page, config.profileUrl);
    console.log(`Current URL: ${page.url()}`);
    await sleep(2000);

    // --- Apply Updates ---
    if (hasValue(config.headline)) await updateHeadline(page, config.headline);
    if (hasValue(config.about)) await updateAbout(page, config.about);
    if (hasValue(config.currentPosition)) await updateCurrentPosition(page, config.currentPosition);
    if (hasValue(config.education)) await updateEducation(page, config.education);
    if (hasValue(config.skillsToAdd)) await addSkills(page, config.skillsToAdd);
    if (hasValue(config.skillsToRemove)) await removeSkills(page, config.skillsToRemove);
    if (hasValue(config.contactInfo)) await updateContactInfo(page, config.contactInfo);

    console.log('=======================');
    console.log('All updates completed!');
    console.log('The browser will remain open for 10 seconds for you to review.');
    console.log('Close the browser window or press Ctrl+C to exit.');
    await sleep(10000);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    console.log('Browser will remain open for debugging.');
    await sleep(60000);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
