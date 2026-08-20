'use strict';
const { launchContext } = require('./browser');
const { loadStorageState, login } = require('./lirunexSession');

const COL = {
  accountDetails: 0,
  accountType: 1,
  referrerName: 5,
  country: 6,
  currency: 7,
  deposit: 8,
  status: 14,
};

function extractAccount(cellText) {
  const m = String(cellText).match(/\d{6,12}/);
  return m ? m[0] : '';
}

function rowsFromCells(rowsCells) {
  return rowsCells
    .map((cells) => ({
      account: extractAccount(cells[COL.accountDetails] || ''),
      accountType: (cells[COL.accountType] || '').trim(),
      referrerName: (cells[COL.referrerName] || '').trim(),
      country: (cells[COL.country] || '').trim(),
      currency: (cells[COL.currency] || '').trim(),
      depositRaw: (cells[COL.deposit] || '').trim(),
      status: (cells[COL.status] || '').trim(),
    }))
    .filter((r) => r.account !== '');
}

function parseRows(tableHtml) {
  const rowMatches = String(tableHtml).match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rowsCells = rowMatches
    .map((tr) => {
      const tds = tr.match(/<td[\s\S]*?<\/td>/gi);
      if (!tds) return null;
      return tds.map((td) =>
        td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      );
    })
    .filter(Boolean);
  return rowsFromCells(rowsCells);
}

async function searchAccount(cfg, account) {
  let state = await loadStorageState(cfg.sessionKey);
  if (!state) {
    console.log('[search] No saved session, logging in first...');
    await login(cfg);
    state = await loadStorageState(cfg.sessionKey);
  }
  const { browser, context } = await launchContext(state);
  try {
    const page = await context.newPage();
    const partnerUrl = `${cfg.portalUrl}/partner/home?lang=en-us`;
    console.log('[search] Navigating to Partner Portal:', partnerUrl);
    await page.goto(partnerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log('[search] Partner Portal URL:', currentUrl);

    if (currentUrl.includes('/auth/login')) {
      console.log('[search] Session expired, re-logging in...');
      await browser.close();
      await login(cfg);
      const newState = await loadStorageState(cfg.sessionKey);
      const retry = await launchContext(newState);
      try {
        const retryPage = await retry.context.newPage();
        await retryPage.goto(partnerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await retryPage.waitForTimeout(3000);
        return await executeSearch(retryPage, account);
      } finally {
        await retry.browser.close();
      }
    }

    return await executeSearch(page, account);
  } finally {
    await browser.close();
  }
}

async function executeSearch(page, account) {
  console.log('[search] Clicking Trading Accounts tab using exact selector...');
  const tabSelector = 'button[data-bs-target="#navs-incard3"], button:has-text("Trading Accounts")';
  await page.waitForSelector(tabSelector, { timeout: 15000 });
  await page.click(tabSelector);
  await page.waitForTimeout(2000);

  console.log('[search] Typing account into search input:', account);
  const inputSelector = '#navs-incard3 input[type="search"], #navs-incard3 input[placeholder*="Search" i], #navs-incard3 input, input[placeholder*="Trading Account" i], input[type="search"]';
  const inputEl = await page.$(inputSelector);
  if (inputEl) {
    await inputEl.fill(account);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  } else {
    console.warn('[search] Search box not found inside tab, reading table directly...');
  }

  console.log('[search] Scraping table rows...');
  const rowsCells = await page.$$eval('#navs-incard3 table tbody tr, table tbody tr', (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
  );
  console.log('[search] Total rows returned:', rowsCells.length);
  return rowsFromCells(rowsCells);
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
