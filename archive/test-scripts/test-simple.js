const http = require('http');

const req = http.get('http://localhost:4001/api/health', (res) => {
  console.log(`API Health Status: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error(`API Health check failed: ${e.message}`);
});
