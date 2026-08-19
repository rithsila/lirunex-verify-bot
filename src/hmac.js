'use strict';
const crypto = require('crypto');

function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function verify(body, signature, secret) {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = sign(body, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { sign, verify };
