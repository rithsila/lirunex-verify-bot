'use strict';

const REQUIRED = [
  'LIRUNEX_PORTAL_URL',
  'LIRUNEX_LOGIN_EMAIL',
  'LIRUNEX_LOGIN_PASSWORD',
  'LIRUNEX_REFERRER_NAME',
  'SESSION_ENCRYPTION_KEY',
  'LIRUNEX_BOT_HMAC_SECRET',
];

function loadConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
  const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return {
    portalUrl: process.env.LIRUNEX_PORTAL_URL.replace(/\/$/, ''),
    loginEmail: process.env.LIRUNEX_LOGIN_EMAIL,
    loginPassword: process.env.LIRUNEX_LOGIN_PASSWORD,
    referrerName: process.env.LIRUNEX_REFERRER_NAME,
    sessionKey: key,
    hmacSecret: process.env.LIRUNEX_BOT_HMAC_SECRET,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}

module.exports = { loadConfig, REQUIRED };
