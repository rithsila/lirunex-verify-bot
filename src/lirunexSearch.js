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
  // Try navigating or clicking sidebar menu
  console.log('[search] Navigating to Partner Contacts...');
  await page.goto(`${cfg.portalUrl}/partner/contacts?lang=en-us`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Log visible text/links on page to diagnose
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('[search] Page snippet:', pageText.replace(/\n+/g, ' '));

  // Check for Trading Accounts tab or sub-item
  const tabSelector = 'text=/Trading Accounts/i, .el-tabs__item:has-text("Trading Accounts"), [role="tab"]:has-text("Trading Accounts"), a:has-text("Trading Accounts"), li:has-text("Trading Accounts")';
  const foundTab = await page.$(tabSelector);
  if (foundTab) {
    console.log('[search] Clicking Trading Accounts tab...');
    await foundTab.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('[search] Tab selector not found, checking if table is already present...');
  }

  console.log('[search] Typing account into search box:', account);
  const inputSelector = 'input[placeholder*="Trading Account" i], input[placeholder*="Account" i], input.el-input__inner';
  const inputEl = await page.$(inputSelector);
  if (inputEl) {
    await inputEl.fill(account);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  } else {
    console.warn('[search] Search input not found, reading table directly...');
  }

  console.log('[search] Scraping table rows...');
  const rowsCells = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
  );
  console.log('[search] Total rows returned:', rowsCells.length);
  return rowsFromCells(rowsCells);
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
