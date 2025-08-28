const swaggerJSDoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');
const candidate = path.resolve(__dirname, '..', 'dist', 'src', 'docs', 'openapi.js');
if (!fs.existsSync(candidate)) {
  console.error('compiled openapi.js not found at', candidate, '\nRun `npm run build` first');
  process.exit(2);
}
const mod = require(candidate);
const opts = mod.options || mod.default?.options;
if (!opts) { console.error('openapi options not exported from compiled module'); process.exit(2); }
const spec = swaggerJSDoc(opts);
fs.writeFileSync(path.resolve(__dirname, '..', 'openapi.snapshot.json'), JSON.stringify(spec, null, 2));
console.log('wrote openapi.snapshot.json');
