const express = require('express');

const app = express();
app.use(express.json());

const now = () => new Date().toISOString();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/budgets', (_req, res) => {
  res.json({
    budgets: [
      {
        id: 'budget-1',
        name: 'Mock Budget',
        lastSync: now(),
      },
    ],
  });
});

app.get('/api/budgets/categories', (_req, res) => {
  res.json({ categories: [] });
});

app.post('/api/snapshots', (_req, res) => {
  res.status(201).json({
    id: 'snapshot-1',
    budgetId: 'budget-1',
    downloadedAt: now(),
    transactionCount: 0,
    categoryCount: 0,
  });
});

app.get('/api/suggestions', (_req, res) => {
  res.json({ suggestions: [] });
});

app.get('/api/suggestions/pending', (_req, res) => {
  res.json({ suggestions: [] });
});

app.post('/api/suggestions/sync-and-generate', (_req, res) => {
  res.json({ suggestions: [], total: 0, mode: 'mock' });
});

app.post('/api/suggestions/generate', (_req, res) => {
  res.json({ suggestions: [], total: 0 });
});

app.post('/api/suggestions/:id/approve', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/suggestions/:id/reject', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/suggestions/:id/approve-payee', (_req, res) => {
  res.json({ success: true, type: 'payee' });
});

app.post('/api/suggestions/:id/approve-category', (_req, res) => {
  res.json({ success: true, type: 'category' });
});

app.post('/api/suggestions/:id/reject-payee', (_req, res) => {
  res.json({ success: true, type: 'payee', withCorrection: false });
});

app.post('/api/suggestions/:id/reject-category', (_req, res) => {
  res.json({ success: true, type: 'category', withCorrection: false });
});

app.post('/api/suggestions/:id/reset', (_req, res) => {
  res.json({ success: true });
});

app.post('/api/suggestions/:id/retry', (_req, res) => {
  res.json({ success: true, suggestions: [], count: 0 });
});

app.post('/api/suggestions/bulk-approve', (_req, res) => {
  res.json({ approved: 0 });
});

app.post('/api/suggestions/bulk-reject', (_req, res) => {
  res.json({ rejected: 0 });
});

app.post('/api/suggestions/bulk-reset', (_req, res) => {
  res.json({ reset: 0 });
});

app.get('/api/sync/pending', (_req, res) => {
  res.json({ changes: [] });
});

app.post('/api/sync/apply', (_req, res) => {
  res.json({ success: true, applied: 0 });
});

app.post('/api/sync/plan', (_req, res) => {
  res.json({
    id: 'plan-1',
    budgetId: 'budget-1',
    changes: [],
    dryRunSummary: {
      totalChanges: 0,
      categoryChanges: 0,
      payeeChanges: 0,
      estimatedImpact: '0 transactions will be categorized',
    },
    createdAt: now(),
  });
});

app.post('/api/sync/execute', (_req, res) => {
  res.json({ success: true });
});

app.get('/api/audit', (_req, res) => {
  res.json({ events: [] });
});

const port = Number(process.env.MOCK_API_PORT || 4010);
app.listen(port, () => {
  console.log(`Mock API listening on http://localhost:${port}`);
});
