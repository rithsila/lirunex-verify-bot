'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('excludes runtime secrets from the Docker build context', () => {
  assert.strictEqual(dockerignore.includes('.env'), true);
  assert.strictEqual(dockerignore.includes('.env.*'), true);
  assert.strictEqual(/^COPY \. \.$/m.test(dockerfile), false);
});

test('matches the Playwright image to the locked package version', () => {
  const imageVersion = dockerfile.match(/playwright:v([^\s-]+)-jammy/)?.[1];
  assert.strictEqual(imageVersion, packageJson.dependencies.playwright);
});
