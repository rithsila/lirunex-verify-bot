'use strict';
const express = require('express');
const { loadConfig } = require('./config');
const { verify } = require('./hmac');
const { searchAccount } = require('./lirunexSearch');

const cfg = loadConfig(); // throws on missing secrets at startup
const app = express();

// Capture the raw body so HMAC is computed over exact bytes.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/verify', async (req, res) => {
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    return res.status(401).json({ error: 'bad signature' });
  }
  const account = String(req.body?.account || '');
  if (!/^\d{6,12}$/.test(account)) {
    return res.status(400).json({ error: 'invalid account' });
  }
  try {
    const rows = await searchAccount(cfg, account);
    return res.json({ found: rows.length > 0, rows, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error('verify.error', err.message);
    return res.status(502).json({ error: 'verification_unavailable' });
  }
});

app.listen(cfg.port, () => console.log(`lirunex-verify-bot on :${cfg.port}`));
