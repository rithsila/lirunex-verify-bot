'use strict';
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { launchContext } = require('./browser');

const SESSION_FILE = path.join(__dirname, '../data/.lirunex_session.enc');

function encrypt(obj, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(JSON.stringify(obj), 'utf8', 'hex');
  enc += cipher.final('hex');
  return { iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex'), data: enc };
}

function decrypt(payload, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  let dec = decipher.update(payload.data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

async function saveStorageState(context, key) {
  const state = await context.storageState();
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(encrypt(state, key)), 'utf8');
}

async function loadStorageState(key) {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    return decrypt(JSON.parse(raw), key);
  } catch {
    return null;
  }
}

// Logs in with email+password (normal login has NO 2FA per product owner;
// 2FA only triggers on password change / withdrawal). Saves session.
async function login(cfg) {
  const { browser, context } = await launchContext();
  try {
    const page = await context.newPage();
    await page.goto(`${cfg.portalUrl}/login`, { waitUntil: 'networkidle' });
    // SELECTORS: verify against the live login page during Task 6 smoke test.
    await page.fill('input[type="email"], input[name="email"]', cfg.loginEmail);
    await page.fill('input[type="password"], input[name="password"]', cfg.loginPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/partner|\/dashboard/, { timeout: 30000 });
    await saveStorageState(context, cfg.sessionKey);
  } finally {
    await browser.close();
  }
}

module.exports = { login, loadStorageState, saveStorageState, encrypt, decrypt, SESSION_FILE };
