import express from 'express';
import memory from './routes/memory';

const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Test server running' });
});

// Memory routes
app.use('/api/memory', memory);

const PORT = 4003;

app.listen(PORT, () => {
  console.log(`Test server listening on http://localhost:${PORT}`);
});
