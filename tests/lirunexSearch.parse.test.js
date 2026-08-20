'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { executeSearch, parseRows } = require('../src/lirunexSearch');

const oneRow = fs.readFileSync(path.join(__dirname, 'fixtures/trading-accounts-1row.html'), 'utf8');
const empty = fs.readFileSync(path.join(__dirname, 'fixtures/trading-accounts-empty.html'), 'utf8');

test('parses a single result row', () => {
  const rows = parseRows(oneRow);
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(r.account, '569307908');
  assert.strictEqual(r.referrerName, 'Sila Rith');
  assert.strictEqual(r.status, 'Active');
  assert.strictEqual(r.depositRaw, '200.00');
  assert.strictEqual(r.currency, 'USC');
});

test('returns empty array when no rows', () => {
  assert.deepStrictEqual(parseRows(empty), []);
});

test('preserves an inactive broker status', () => {
  const inactive = oneRow.replace('<td>Active</td>', '<td>Inactive</td>');
  const rows = parseRows(inactive);
  assert.strictEqual(rows[0].status, 'Inactive');
});

test('does not log raw broker row values during search', async () => {
  const cells = [
    '569307908 FlexGridPro-01',
    'Advance Cent Plus MT5',
    '1:500',
    'John Doe',
    'john@example.com',
    'Sila Rith',
    'Cambodia',
    'USC',
    '200.00',
    '0.00',
    '200.00',
    '200.00',
    '0.00',
    '0.00',
    'Active',
  ];
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);

  const page = {
    $: async () => null,
    goto: async () => {},
    waitForTimeout: async () => {},
    waitForSelector: async () => ({
      click: async () => {},
      fill: async () => {},
    }),
    keyboard: { press: async () => {} },
    $$eval: async () => [cells],
    url: () => 'https://client.lirunex.online/partner/contacts',
  };

  try {
    const rows = await executeSearch(
      page,
      { portalUrl: 'https://client.lirunex.online' },
      '569307908',
    );
    assert.strictEqual(rows.length, 1);
  } finally {
    console.log = originalLog;
  }

  assert.strictEqual(JSON.stringify(logs).includes('john@example.com'), false);
});
