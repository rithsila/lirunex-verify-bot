'use strict';
const { createApp } = require('./app');
const { loadConfig } = require('./config');

const cfg = loadConfig();
const app = createApp({ cfg });
app.listen(cfg.port, () => console.log(`lirunex-verify-bot on :${cfg.port}`));
