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

async function login(cfg) {
  const { browser, context } = await launchContext();
  try {
    const page = await context.newPage();
    const loginUrl = `${cfg.portalUrl}/auth/login?lang=en-us`;
    console.log('[login] Navigating to:', loginUrl);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[login] Current page URL:', page.url());
    console.log('[login] Page title:', await page.title());

    const emailSelector = 'input[type="email"], input[name="email"], input[name="username"], input[placeholder*="Email" i], input[placeholder*="Username" i], input[placeholder*="Account" i], input.el-input__inner';
    await page.waitForSelector(emailSelector, { timeout: 15000 });
    console.log('[login] Found email input, filling credentials...');
    await page.fill(emailSelector, cfg.loginEmail);

    const passSelector = 'input[type="password"], input[name="password"], input[placeholder*="Password" i]';
    await page.fill(passSelector, cfg.loginPassword);

    const submitSelector = 'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), .el-button--primary';
    console.log('[login] Clicking submit...');
    await page.click(submitSelector);

    console.log('[login] Waiting for navigation past login...');
    await page.waitForTimeout(5000);
    console.log('[login] After click URL:', page.url());

    await saveStorageState(context, cfg.sessionKey);
    console.log('[login] Session saved successfully');
  } catch (err) {
    console.error('[login.failed]', err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { login, loadStorageState, saveStorageState, encrypt, decrypt, SESSION_FILE };
