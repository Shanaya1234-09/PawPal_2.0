try { process.loadEnvFile(); } catch (e) { /* no .env file, use real environment */ }
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const { HttpError } = require('./util');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false })); // the prototype frontend is inline-heavy
const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: !!db.prepare('SELECT 1 x').get() }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', require('./routes/account'));
app.use('/api', require('./routes/emergency').public);
app.use('/api/community', require('./routes/community'));
app.use('/api/pets', require('./routes/pets').router);
app.use('/api/pets', require('./routes/emergency').router);
app.use('/api/pets', require('./routes/assistant'));

app.get('/pawpal-api.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'pawpal-api.js')));
if (process.env.FRONTEND_DIR) app.use(express.static(path.resolve(process.env.FRONTEND_DIR)));

app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint' }));

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('PawPal API listening on http://localhost:' + port));
}
