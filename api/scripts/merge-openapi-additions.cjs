const fs = require('fs');
const path = require('path');

const snapshotPath = path.resolve(__dirname, '..', 'openapi.snapshot.json');
const additionsPath = path.resolve(__dirname, '..', 'openapi.additions.json');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error('Failed to parse', p, e); return null; }
}

const snapshot = readJson(snapshotPath);
const adds = readJson(additionsPath);

if (!snapshot) {
  console.error('Snapshot not found at', snapshotPath);
  process.exit(1);
}

if (!adds) {
  console.log('No additions file found; nothing to merge');
  process.exit(0);
}

snapshot.paths = Object.assign({}, snapshot.paths || {}, adds.paths || {});

if (adds.components && adds.components.schemas) {
  snapshot.components = snapshot.components || {};
  snapshot.components.schemas = Object.assign({}, snapshot.components.schemas || {}, adds.components.schemas || {});
}

// backup original
try {
  const backup = snapshotPath + '.bak';
  if (!fs.existsSync(backup)) fs.copyFileSync(snapshotPath, backup);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('Merged additions into snapshot and wrote', snapshotPath);
  process.exit(0);
} catch (e) {
  console.error('Failed to write merged snapshot', e);
  process.exit(1);
}
