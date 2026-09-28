const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT  || 3001;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data', 'plans');
const AUTH = process.env.AUTH_TOKEN || '';

// ── CORS ─────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));

// ── Auth middleware ───────────────────────────────────────────────────────
function auth(req, res, next) {
  if (!AUTH) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${AUTH}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Serve built PWA (optional, if webapp/dist exists) ─────────────────────
const webDist = path.join(__dirname, '..', 'webapp', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
}

// ── Ensure data dir ───────────────────────────────────────────────────────
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const planFile = (id) => path.join(DATA, `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }));

// ── GET /api/plans — list all plans ──────────────────────────────────────
app.get('/api/plans', auth, (req, res) => {
  const files = fs.readdirSync(DATA).filter(f => f.endsWith('.json'));
  const list = files.map(f => {
    try {
      const raw  = fs.readFileSync(path.join(DATA, f), 'utf8');
      const plan = JSON.parse(raw);
      return {
        id:   plan._syncId || f.replace('.json', ''),
        name: plan.meta?.production || f.replace('.json', ''),
        date: plan.meta?.date || null,
        instances: plan.instances?.length || 0,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
  res.json(list);
});

// ── GET /api/plans/:id — get plan ─────────────────────────────────────────
app.get('/api/plans/:id', auth, (req, res) => {
  const f = planFile(req.params.id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' });
  try {
    res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Read error' });
  }
});

// ── PUT /api/plans/:id — save plan ────────────────────────────────────────
app.put('/api/plans/:id', auth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid body' });
  try {
    fs.writeFileSync(planFile(req.params.id), JSON.stringify(body, null, 2), 'utf8');
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/plans/:id — delete plan ───────────────────────────────────
app.delete('/api/plans/:id', auth, (req, res) => {
  const f = planFile(req.params.id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(f);
  res.json({ ok: true });
});

// ── Fallback to index.html for SPA ───────────────────────────────────────
if (fs.existsSync(webDist)) {
  app.get('*', (_, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Stromplaner Sync-Server läuft auf Port ${PORT}`);
  console.log(`Pläne in: ${DATA}`);
  if (AUTH) console.log('Auth-Token aktiv.');
  if (fs.existsSync(webDist)) console.log('PWA wird serviert.');
});
