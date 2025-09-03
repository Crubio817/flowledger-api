const https = require('http');
const fs = require('fs');

const req = https.get('http://localhost:4001/openapi.json', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('openapi.snapshot.json', data);
    console.log('OpenAPI snapshot saved successfully');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Error fetching OpenAPI spec:', err);
  process.exit(1);
});

req.setTimeout(5000, () => {
  console.error('Request timeout');
  process.exit(1);
});
