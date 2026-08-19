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

// Extract the numeric account id from the "A/C Details" cell, whose text looks
// like "569307908\nFlexGridPro-01". Take the first run of 6-12 digits.
function extractAccount(cellText) {
  const m = String(cellText).match(/\d{6,12}/);
  return m ? m[0] : '';
}

// rowsCells: Array<Array<string>> — each inner array is one row's cell texts.
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

// parseRows: minimal HTML-string parser for tests/fallback. Splits <tr>/<td>.
function parseRows(tableHtml) {
  const rowMatches = String(tableHtml).match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rowsCells = rowMatches
    .map((tr) => {
      const tds = tr.match(/<td[\s\S]*?<\/td>/gi);
      if (!tds) return null; // header row (uses <th>)
      return tds.map((td) =>
        td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      );
    })
    .filter(Boolean);
  return rowsFromCells(rowsCells);
}

// Drives the portal and returns parsed rows.
async function searchAccount(cfg, account) {
  let state = await loadStorageState(cfg.sessionKey);
  if (!state) {
    await login(cfg);
    state = await loadStorageState(cfg.sessionKey);
  }
  const { browser, context } = await launchContext();
  try {
    // Re-create context WITH the saved storage state.
    if (state?.cookies) {
      await context.addCookies(state.cookies);
    }
    const page = await context.newPage();
    await page.goto(`${cfg.portalUrl}/partner/contacts`, { waitUntil: 'networkidle' });

    // If redirected to login, session expired → re-login once and retry.
    if (/\/login/.test(page.url())) {
      await browser.close();
      await login(cfg);
      return await searchAccount(cfg, account); // one retry
    }

    // Open the Trading Accounts tab.
    await page.click('text=Trading Accounts');
    // Type into the "Trading Account Id" search box.
    await page.fill('input[placeholder="Trading Account Id"]', account);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500); // let the table refresh

    // Extract each data row's cell texts.
    const rowsCells = await page.$$eval('table tbody tr', (trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()))
    );
    return rowsFromCells(rowsCells);
  } finally {
    await browser.close();
  }
}

module.exports = { parseRows, rowsFromCells, extractAccount, COL, searchAccount };
