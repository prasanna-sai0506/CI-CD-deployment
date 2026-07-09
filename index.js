const express = require('express');
const path = require('path');
const healthRouter = require('./src/routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// API Version route
app.get('/api/version', (req, res) => {
  res.json({
    version: process.env.GIT_SHA || 'development'
  });
});

// Health check route
app.use('/health', healthRouter);

// Dashboard route (serves dashboard.html)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Only start the server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Express app listening on port ${PORT}`);
  });
}

module.exports = app;
