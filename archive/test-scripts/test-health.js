const http = require('http');

const req = http.get('http://localhost:4001/healthz', (res) => {
  console.log(`Health Status: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
  res.on('end', () => {
    console.log('\nHealth check complete');
  });
});

req.on('error', (e) => {
  console.error(`Health check failed: ${e.message}`);
});
