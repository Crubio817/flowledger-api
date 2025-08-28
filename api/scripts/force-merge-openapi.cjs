#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const snapshotPath = path.join(root, 'openapi.snapshot.json');
const additionsPath = path.join(root, 'openapi.additions.json');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('Failed to parse JSON', p, err.message);
    process.exit(2);
  }
}

const snapshot = readJson(snapshotPath);
const additions = readJson(additionsPath);
if (!snapshot) {
  console.error('Snapshot file not found:', snapshotPath);
  process.exit(1);
}
if (!additions) {
  console.error('Additions file not found:', additionsPath);
  process.exit(1);
}

snapshot.paths = Object.assign({}, snapshot.paths || {}, additions.paths || {});
if (additions.components && additions.components.schemas) {
  snapshot.components = snapshot.components || {};
  snapshot.components.schemas = Object.assign({}, snapshot.components.schemas || {}, additions.components.schemas || {});
}

fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log('Merged additions into snapshot:', snapshotPath);
process.exit(0);
