'use strict';
const { launchContext } = require('./browser');
const { loadStorageState, login } = require('./lirunexSession');

// Column index map for the Trading Accounts table matching your screenshot:
// 0: A/C Details
// 1: A/C Type
// 2: A/C Leverage
// 3: Client Details
// 4: Client Contacts
// 5: Referrer Name
// 6: Country
// 7: Currency
// 8: Deposit
// 9: Withdrawal
// 10: Nett Deposit
// 11: Balance
const COL = {
  accountDetails: 0,
  accountType: 1,
  referrerName: 5,
  country: 6,
  currency: 7,
  deposit: 8,
  status: 1, // Status default to Active if not present in columns
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
      status: 'Active',
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
  console.log('[search] Clicking Trading Accounts tab...');
  const tabSelector = 'button[data-bs-target="#navs-incard3"], button:has-text("Trading Accounts")';
  const tabEl = await page.$(tabSelector);
  if (tabEl) {
    await tabEl.click();
    await page.waitForTimeout(2000);
  }

  console.log('[search] Finding Trading Account Id input...');
  const inputSelector = 'input.search-input[placeholder="Trading Account Id"], input[placeholder="Trading Account Id"]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.fill(inputSelector, account);
  await page.keyboard.press('Enter');

  // Also click the search magnifying icon if present
  const searchIcon = await page.$('.search-icon, i.bi-search');
  if (searchIcon) {
    await searchIcon.click();
  }
  await page.waitForTimeout(3000);

  console.log('[search] Scraping table rows...');
  const rowsCells = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
  );
  console.log('[search] Total rows returned:', rowsCells.length);
  return rowsFromCells(rowsCells);
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
