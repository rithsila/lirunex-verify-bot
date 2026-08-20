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
  status: 1,
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
    console.log('[search] Navigating to Home first...');
    await page.goto(`${cfg.portalUrl}/home?lang=en-us`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log('[search] Home URL:', currentUrl);

    if (currentUrl.includes('/auth/login')) {
      console.log('[search] Session expired, re-logging in...');
      await browser.close();
      await login(cfg);
      const newState = await loadStorageState(cfg.sessionKey);
      const retry = await launchContext(newState);
      try {
        const retryPage = await retry.context.newPage();
        await retryPage.goto(`${cfg.portalUrl}/home?lang=en-us`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await retryPage.waitForTimeout(3000);
        return await executeSearch(retryPage, cfg, account);
      } finally {
        await retry.browser.close();
      }
    }

    return await executeSearch(page, cfg, account);
  } finally {
    await browser.close();
  }
}

async function executeSearch(page, cfg, account) {
  // Step 1: Switch to Partner Portal if on Client Portal
  const partnerLinkSelector = 'a[href*="/partner/home?portal=PartnerPortal"], a:has-text("Partner Portal")';
  const partnerLink = await page.$(partnerLinkSelector);
  if (partnerLink) {
    console.log('[search] Switching to Partner Portal...');
    await partnerLink.click();
    await page.waitForTimeout(3000);
  }

  // Step 2: Click Contacts in sidebar menu
  console.log('[search] Clicking Contacts menu in sidebar...');
  const contactsSelector = 'a[href*="/partner/contacts"], a.side-menu__item:has-text("Contacts"), .side-menu__label:has-text("Contacts")';
  const contactsEl = await page.$(contactsSelector);
  if (contactsEl) {
    await contactsEl.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('[search] Direct navigating to /partner/contacts?lang=en-us...');
    await page.goto(`${cfg.portalUrl}/partner/contacts?lang=en-us`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  console.log('[search] Current Contacts page URL:', page.url());

  // Step 3: Click Trading Accounts tab
  console.log('[search] Clicking Trading Accounts tab...');
  const tabSelector = 'button[data-bs-target="#navs-incard3"], button:has-text("Trading Accounts")';
  const tabEl = await page.waitForSelector(tabSelector, { state: 'attached', timeout: 15000 });
  await tabEl.click();
  await page.waitForTimeout(2500);

  // Step 4: Type into Trading Account Id input
  console.log('[search] Finding Trading Account Id input...');
  const inputSelector = 'input.search-input[placeholder="Trading Account Id"], input[placeholder="Trading Account Id"], input.search-input';
  const inputEl = await page.waitForSelector(inputSelector, { state: 'attached', timeout: 15000 });
  await inputEl.fill(account);

  // Step 5: Click the magnifying glass icon or press Enter
  console.log('[search] Triggering search...');
  const searchIconSelector = 'i.bi-search.searchable.search-icon, i.bi-search, .search-icon';
  const searchIcon = await page.$(searchIconSelector);
  if (searchIcon) {
    await searchIcon.click();
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // Step 6: Scrape table rows specifically from the active tab table
  console.log('[search] Scraping table rows from #navs-incard3 table...');
  const tableSelector = '#navs-incard3 div.card-datatable table tbody tr, #navs-incard3 table tbody tr, table tbody tr';
  const rowsCells = await page.$$eval(tableSelector, (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
  );
  console.log('[search] Total rows scraped:', rowsCells.length);
  if (rowsCells.length > 0) {
    console.log('[search] First row sample:', JSON.stringify(rowsCells[0]));
  }
  return rowsFromCells(rowsCells);
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
