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
  console.log('[search] Clicking Partner Portal link from header...');
  const partnerLinkSelector = 'a[href*="/partner/home?portal=PartnerPortal"], a:has-text("Partner Portal")';
  const partnerLink = await page.$(partnerLinkSelector);
  if (partnerLink) {
    console.log('[search] Found Partner Portal link, clicking...');
    await partnerLink.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('[search] Direct navigating to /partner/home?portal=PartnerPortal...');
    await page.goto(`${cfg.portalUrl}/partner/home?portal=PartnerPortal&lang=en-us`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  console.log('[search] Current portal URL:', page.url());

  console.log('[search] Clicking Trading Accounts tab...');
  const tabSelector = 'button[data-bs-target="#navs-incard3"], button:has-text("Trading Accounts")';
  const tabEl = await page.$(tabSelector);
  if (tabEl) {
    await tabEl.click();
    await page.waitForTimeout(3000); // give tab pane time to fade in
  }

  console.log('[search] Finding Trading Account Id input...');
  const inputSelector = '#navs-incard3 input.search-input, #navs-incard3 input, input.search-input, input[placeholder*="Trading Account" i]';
  const inputEl = await page.waitForSelector(inputSelector, { state: 'attached', timeout: 15000 });
  await inputEl.fill(account);
  await page.keyboard.press('Enter');

  const searchIcon = await page.$('#navs-incard3 .search-icon, .search-icon, i.bi-search');
  if (searchIcon) {
    await searchIcon.click();
  }
  await page.waitForTimeout(3000);

  console.log('[search] Scraping table rows...');
  const rowsCells = await page.$$eval('#navs-incard3 table tbody tr, table tbody tr', (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
  );
  console.log('[search] Total rows scraped:', rowsCells.length);
  return rowsFromCells(rowsCells);
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
