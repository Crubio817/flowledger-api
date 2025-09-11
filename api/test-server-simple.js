const express = require('express');

console.log('Creating simple test server...');
const app = express();

app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'Test server working' });
});

const PORT = process.env.PORT || 4001;
const server = app.listen(PORT, () => {
  console.log(`Simple test server listening on http://localhost:${PORT}`);
});

// Auto-shutdown after 30 seconds for testing
setTimeout(() => {
  console.log('Shutting down test server...');
  server.close();
  process.exit(0);
}, 30000);
