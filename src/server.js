'use strict';
const express = require('express');
const { loadConfig } = require('./config');
const { verify } = require('./hmac');
const { searchAccount } = require('./lirunexSearch');

const cfg = loadConfig();
const app = express();

app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/verify', async (req, res) => {
  console.log('[POST /verify] Incoming request from:', req.ip, 'account:', req.body?.account);
  const sig = req.header('X-Signature') || '';
  if (!verify(req.rawBody || '', sig, cfg.hmacSecret)) {
    console.warn('[POST /verify] Bad signature rejected');
    return res.status(401).json({ error: 'bad signature' });
  }
  const account = String(req.body?.account || '');
  if (!/^\d{6,12}$/.test(account)) {
    return res.status(400).json({ error: 'invalid account' });
  }
  try {
    console.log('[POST /verify] Searching account:', account);
    const rows = await searchAccount(cfg, account);
    console.log('[POST /verify] Found rows:', rows.length);
    return res.json({ found: rows.length > 0, rows, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[POST /verify] Error:', err.message);
    return res.status(502).json({ error: 'verification_unavailable', details: err.message });
  }
});

app.listen(cfg.port, () => console.log(`lirunex-verify-bot on :${cfg.port}`));
