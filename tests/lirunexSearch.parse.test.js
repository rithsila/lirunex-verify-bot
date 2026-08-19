'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseRows } = require('../src/lirunexSearch');

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
