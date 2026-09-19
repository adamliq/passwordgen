'use strict';
/*
 * CI smoke test for the standalone Secure Password Generator.
 *
 * Loads the page exactly as a user would (a file:// page, no server), drives
 * the core flows through the real UI, and runs the page's own in-page
 * self-test suite. Exits non-zero on any failure so it can gate CI.
 *
 * This intentionally does not re-implement deep cryptographic or QR-format
 * checks here — those live in the page's own SelfTestRunner (see
 * secure-password-generator.html) and are exercised via "Run self-tests"
 * below. This script's job is to catch UI-level regressions the self-tests
 * can't see: does the page load without errors, does clicking Generate
 * actually produce a password, does batch mode produce the right number of
 * rows, and so on — plus keeping the two shipped copies of the page in sync.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const PRIMARY_FILE = path.join(REPO_ROOT, 'secure-password-generator.html');
const MIRROR_FILE = path.join(REPO_ROOT, 'index.html');

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log('PASS - ' + name);
  } else {
    failures++;
    console.error('FAIL - ' + name + (detail ? ' (' + detail + ')' : ''));
  }
}

async function main() {
  // 1. The two shipped copies of the page must be identical. They're
  // maintained as separate files (one named for clarity, one for GitHub
  // Pages) and kept in sync by hand on every change — this catches a
  // forgotten sync before it ships.
  const primaryContent = fs.readFileSync(PRIMARY_FILE, 'utf8');
  const mirrorContent = fs.readFileSync(MIRROR_FILE, 'utf8');
  check(
    'secure-password-generator.html and index.html are identical',
    primaryContent === mirrorContent,
    'run: cp secure-password-generator.html index.html'
  );

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('file://' + PRIMARY_FILE);
  await page.waitForTimeout(150);

  // 2. No auto-generated password on load (a core privacy requirement).
  const emptyOnLoad = await page.isVisible('#results-empty');
  check('no password is auto-generated on page load', emptyOnLoad);

  // 3. Basic random-password generation.
  await page.click('#generate-btn');
  await page.waitForTimeout(150);
  const randomValue = await page.textContent('#results-list .result-value');
  check('generate produces a 20-character password by default', typeof randomValue === 'string' && randomValue.trim().length === 20, 'got length ' + (randomValue || '').trim().length);

  // 4. Passphrase mode. Default settings are 5 words, hyphen-separated,
  // plus one appended random digit — 6 segments in total.
  await page.click('#tab-passphrase');
  await page.click('#generate-btn');
  await page.waitForTimeout(150);
  const passphraseValue = await page.textContent('#results-list .result-value');
  const segments = passphraseValue.trim().split('-');
  const wordSegments = segments.slice(0, 5);
  const trailingDigit = segments[5];
  check(
    'passphrase mode produces 5 hyphenated words plus a trailing digit by default',
    segments.length === 6 && wordSegments.every((s) => /^[A-Za-z]+$/.test(s)) && /^[0-9]$/.test(trailingDigit || ''),
    'got: ' + passphraseValue
  );

  // 5. Batch generation.
  await page.click('#tab-random');
  await page.fill('#batch-size', '10');
  await page.click('#generate-btn');
  await page.waitForTimeout(200);
  const rowCount = await page.$$eval('#results-list .result-row', (els) => els.length);
  check('batch size 10 produces 10 result rows', rowCount === 10, 'got ' + rowCount);
  await page.fill('#batch-size', '1');

  // 6. QR code button renders an SVG for a generated password.
  await page.click('#results-list .result-row:first-child button:has-text("QR code")');
  await page.waitForTimeout(150);
  const hasQrSvg = await page.isVisible('#qr-code-container svg');
  check('QR code dialog renders an SVG code', hasQrSvg);
  await page.click('#qr-dialog-close-btn');
  await page.waitForTimeout(100);

  // 7. Run the page's own self-test suite and require zero failures.
  await page.$eval('#self-test-section', (el) => { el.open = true; });
  await page.click('#run-self-tests-btn');
  await page.waitForFunction(
    () => document.getElementById('run-self-tests-btn').textContent === 'Run self-tests',
    { timeout: 20000 }
  );
  const testRows = await page.$$eval('#self-test-tbody tr', (rows) =>
    rows.map((row) => ({
      name: row.children[0].textContent.trim(),
      status: row.children[1].textContent.trim(),
      detail: row.children[2] ? row.children[2].textContent.trim() : ''
    }))
  );
  check('self-test suite ran and reported results', testRows.length > 0, 'no rows found');
  for (const row of testRows) {
    check('self-test: ' + row.name, row.status !== 'FAIL', row.detail);
  }

  // 8. No unexpected console/page errors anywhere during the run above.
  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console errors during the run', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();

  console.log('');
  if (failures > 0) {
    console.error(failures + ' check(s) failed.');
    process.exit(1);
  } else {
    console.log('All smoke checks passed.');
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
