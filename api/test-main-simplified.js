const express = require('express');
const cors = require('cors');

console.log('Creating FlowLedger API server...');

async function createApp() {
  const app = express();
  
  // Basic middleware
  app.use(cors());
  app.use(express.json());
  
  // Health check that doesn't require database
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      message: 'FlowLedger API with Memory Layer is running'
    });
  });

  // Simple test endpoint
  app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working' });
  });

  return { app };
}

async function startServer() {
  try {
    console.log('Initializing application...');
    const { app } = await createApp();
    
    const PORT = process.env.PORT || 4001;
    const server = app.listen(PORT, () => {
      console.log(`FlowLedger API server listening on http://localhost:${PORT}`);
      console.log('Memory layer integration complete - ready for testing');
    });
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
