const http = require('http');
const fs = require('fs');

const url = process.env.SPEC_URL || 'http://localhost:4001/openapi.json';
const out = 'openapi.snapshot.json';

const req = http.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to fetch OpenAPI spec: HTTP ${res.statusCode}`);
    res.resume(); // drain
    process.exit(1);
    return;
  }
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (!data || !data.trim()) {
      console.error('Fetched OpenAPI body is empty; not writing snapshot');
      process.exit(1);
      return;
    }
    try {
      JSON.parse(data); // validate JSON
    } catch (e) {
      console.error('Fetched OpenAPI body is not valid JSON:', e?.message || e);
      process.exit(1);
      return;
    }
    fs.writeFileSync(out, data);
    console.log('OpenAPI snapshot saved to', out);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Error fetching OpenAPI spec:', err.message || err);
  process.exit(1);
});

req.setTimeout(8000, () => {
  console.error('Request timeout');
  req.destroy();
  process.exit(1);
});
