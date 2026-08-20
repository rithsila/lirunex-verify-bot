'use strict';
const { launchContext } = require('./browser');
const { loadStorageState, login } = require('./lirunexSession');

// Column index map for the Trading Accounts table (0-based).
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
  const { browser, context } = await launchContext();
  try {
    if (state?.cookies) {
      await context.addCookies(state.cookies);
    }
    const page = await context.newPage();
    const contactsUrl = `${cfg.portalUrl}/partner/contacts`;
    console.log('[search] Navigating to:', contactsUrl);
    await page.goto(contactsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (/\/login/.test(page.url())) {
      console.log('[search] Redirected to login, refreshing session...');
      await browser.close();
      await login(cfg);
      return await searchAccount(cfg, account);
    }

    console.log('[search] Clicking Trading Accounts tab...');
    const tabSelector = 'text="Trading Accounts", .el-tabs__item:has-text("Trading Accounts"), [role="tab"]:has-text("Trading Accounts")';
    await page.waitForSelector(tabSelector, { timeout: 15000 });
    await page.click(tabSelector);
    await page.waitForTimeout(1500);

    console.log('[search] Typing account into search input:', account);
    const inputSelector = 'input[placeholder*="Trading Account Id" i], input[placeholder*="Account" i], input.el-input__inner';
    await page.waitForSelector(inputSelector, { timeout: 15000 });
    await page.fill(inputSelector, account);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    console.log('[search] Scraping table rows...');
    const rowsCells = await page.$$eval('table tbody tr', (trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
    );
    console.log('[search] Total scraped rows:', rowsCells.length);
    return rowsFromCells(rowsCells);
  } finally {
    await browser.close();
  }
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
