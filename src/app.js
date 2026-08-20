'use strict';
const express = require('express');
const { verify } = require('./hmac');
const { searchAccount } = require('./lirunexSearch');

const MAX_CONCURRENT_SEARCHES = 1;

function createApp({ cfg, search = searchAccount, logger = console }) {
  const app = express();
  let activeSearches = 0;

  app.use(express.json({
    limit: '8kb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/verify', async (req, res) => {
    const signature = req.header('X-Signature') || '';
    if (!verify(req.rawBody || '', signature, cfg.hmacSecret)) {
      logger.warn('[POST /verify] Bad signature rejected');
      return res.status(401).json({ error: 'bad signature' });
    }

    const account = String(req.body?.account || '');
    if (!/^\d{6,12}$/.test(account)) {
      return res.status(400).json({ error: 'invalid account' });
    }

    if (activeSearches >= MAX_CONCURRENT_SEARCHES) {
      return res
        .status(503)
        .set('Retry-After', '5')
        .json({ error: 'verification_busy' });
    }

    activeSearches += 1;
    logger.log('[POST /verify] Accepted account ending:', account.slice(-4));

    try {
      const rows = await search(cfg, account);
      logger.log('[POST /verify] Found rows:', rows.length);
      return res.json({ found: rows.length > 0, rows, checkedAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[POST /verify] Error:', message);
      return res.status(502).json({ error: 'verification_unavailable', details: message });
    } finally {
      activeSearches -= 1;
    }
  });

  return app;
}

module.exports = { createApp, MAX_CONCURRENT_SEARCHES };
