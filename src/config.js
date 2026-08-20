'use strict';
const fs = require('fs');
const path = require('path');

// Auto-load .env file if present in the project directory
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch (_) {
    // If not supported, fallback to manual parse
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

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
