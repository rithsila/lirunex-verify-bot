'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const { createApp } = require('../src/app');
const { sign } = require('../src/hmac');

const cfg = { hmacSecret: 'test-secret' };

async function startServer(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function postVerify(url, body, signature) {
  return await fetch(`${url}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body,
  });
}

test('rejects unauthenticated multiline input without logging attacker text', async () => {
  const logs = [];
  const logger = {
    log: (...args) => logs.push(args),
    warn: (...args) => logs.push(args),
    error: (...args) => logs.push(args),
  };
  let searchCalls = 0;
  const app = createApp({
    cfg,
    logger,
    search: async () => {
      searchCalls += 1;
      return [];
    },
  });
  const server = await startServer(app);
  const body = JSON.stringify({ account: '123456\nFORGED', requestId: 'request-1' });

  try {
    const response = await postVerify(server.url, body, 'invalid');
    assert.strictEqual(response.status, 401);
    assert.strictEqual(searchCalls, 0);
    assert.strictEqual(JSON.stringify(logs).includes('FORGED'), false);
  } finally {
    await server.close();
  }
});

test('rejects a concurrent browser search while the permit is occupied', async () => {
  let releaseSearch;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let searchCalls = 0;
  const app = createApp({
    cfg,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    search: async () => {
      searchCalls += 1;
      markStarted();
      return await new Promise((resolve) => {
        releaseSearch = resolve;
      });
    },
  });
  const server = await startServer(app);
  const firstBody = JSON.stringify({ account: '569307908', requestId: 'request-1' });
  const secondBody = JSON.stringify({ account: '569307909', requestId: 'request-2' });

  try {
    const firstResponsePromise = postVerify(server.url, firstBody, sign(firstBody, cfg.hmacSecret));
    await started;

    const secondResponse = await postVerify(
      server.url,
      secondBody,
      sign(secondBody, cfg.hmacSecret),
    );
    assert.strictEqual(secondResponse.status, 503);
    assert.deepStrictEqual(await secondResponse.json(), { error: 'verification_busy' });
    assert.strictEqual(searchCalls, 1);

    releaseSearch([]);
    const firstResponse = await firstResponsePromise;
    assert.strictEqual(firstResponse.status, 200);
  } finally {
    await server.close();
  }
});
