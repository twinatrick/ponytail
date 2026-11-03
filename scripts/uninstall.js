#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const stateDir = path.join(base, 'opencode', 'ponytail');
const legacyState = path.join(base, 'opencode', '.ponytail-active');

for (const target of [stateDir, legacyState]) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('Removed Ponytail OpenCode state:', target);
  }
}
