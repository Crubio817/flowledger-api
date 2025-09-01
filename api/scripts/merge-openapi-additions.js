/*
 Merge api/openapi.additions.json into api/openapi.snapshot.json
 - Object values are deep-merged (additions override/extend)
 - Arrays/primitives in additions replace snapshot values
 - Writes merged result back to api/openapi.snapshot.json (pretty-printed)
*/
const fs = require('fs');
const snapPath = 'api/openapi.snapshot.json';
const addPath = 'api/openapi.additions.json';

function readJson(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); }
  catch(e){ console.error(`Failed to parse ${p}:`, e.message); process.exit(2); }
}

function isObject(v){ return v && typeof v === 'object' && !Array.isArray(v); }

function deepMerge(base, add){
  for(const k of Object.keys(add||{})){
    if (isObject(add[k]) && isObject(base[k])){
      base[k] = deepMerge(Object.assign({}, base[k]), add[k]);
    } else {
      // arrays and primitives are replaced
      base[k] = add[k];
    }
  }
  return base;
}

if (!fs.existsSync(snapPath)){
  console.error('Snapshot not found at', snapPath);
  process.exit(3);
}
if (!fs.existsSync(addPath)){
  console.error('Additions file not found at', addPath);
  process.exit(4);
}

const snapshot = readJson(snapPath);
const additions = readJson(addPath);

// merge additions into snapshot
const merged = deepMerge(Object.assign({}, snapshot), additions);

// write output
fs.writeFileSync(snapPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
console.log('Merged additions into', snapPath);
