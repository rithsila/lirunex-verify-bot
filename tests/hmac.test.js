'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { sign, verify } = require('../src/hmac');

const secret = 'test-secret';
const body = JSON.stringify({ account: '569307908', requestId: 'abc' });

test('verify accepts a correct signature', () => {
  const sig = sign(body, secret);
  assert.strictEqual(verify(body, sig, secret), true);
});

test('verify rejects a tampered body', () => {
  const sig = sign(body, secret);
  const tampered = JSON.stringify({ account: '999999999', requestId: 'abc' });
  assert.strictEqual(verify(tampered, sig, secret), false);
});

test('verify rejects a wrong signature', () => {
  assert.strictEqual(verify(body, 'deadbeef', secret), false);
});
