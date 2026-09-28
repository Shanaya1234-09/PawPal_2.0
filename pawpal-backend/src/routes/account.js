const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { sign, auth } = require('../auth');
const { HttpError, str, oneOf, bad } = require('../util');

const router = express.Router();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const email = (v) => {
  v = str(v, 'email', { max: 120 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw bad('Enter a valid email');
  return v;
};
const password = (v) => {
  if (typeof v !== 'string' || v.length < 8 || v.length > 100) throw bad('Password must be 8-100 characters');
  return v;
};
const session = (u) => ({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, phone: u.phone, language: u.language, circle: u.circle } });

/* mail is a stub: swap for SES/Resend/etc. Dev logs the link. */
function sendMail(to, subject, body) { console.log('[mail] to=%s subject=%s\n%s', to, subject, body); }

router.post('/auth/register', (req, res) => {
  const b = req.body || {};
  const e = email(b.email);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw new HttpError(409, 'An account with this email already exists');
  const info = db.prepare('INSERT INTO users(email,password_hash,name,phone) VALUES(?,?,?,?)')
    .run(e, bcrypt.hashSync(password(b.password), 10), str(b.name, 'name', { max: 60 }), str(b.phone, 'phone', { max: 20, optional: true }));
  res.status(201).json(session(db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid)));
});

router.post('/auth/login', (req, res) => {
  const b = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(b.password || ''), u.password_hash)) throw new HttpError(401, 'Email or password is wrong');
  res.json(session(u));
});

/* always 200 so the endpoint cannot be used to discover which emails have accounts */
router.post('/auth/forgot', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String((req.body || {}).email || '').trim().toLowerCase());
  if (u) {
    const raw = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)')
      .run(sha(raw), u.id, new Date(Date.now() + 15 * 60e3).toISOString());
    sendMail(u.email, 'Reset your PawPal password', 'Token (valid 15 minutes): ' + raw);
  }
  res.json({ ok: true });
});

router.post('/auth/reset', (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND used=0').get(sha(String(b.token || '')));
  if (!row || row.expires_at < new Date().toISOString()) throw new HttpError(400, 'This reset link has expired');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password(b.password), 10), row.user_id);
    db.prepare('UPDATE password_resets SET used=1 WHERE token_hash=?').run(row.token_hash);
  })();
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => res.json(req.user));

router.patch('/me', auth, (req, res) => {
  const b = req.body || {};
  const u = req.user;
  if ('name' in b) u.name = str(b.name, 'name', { max: 60 });
  if ('phone' in b) u.phone = str(b.phone, 'phone', { max: 20, optional: true });
  if ('language' in b) u.language = oneOf(b.language, ['en', 'kn', 'hi'], 'language');
  if ('circle' in b) u.circle = str(b.circle, 'circle', { max: 60 });
  db.prepare('UPDATE users SET name=?,phone=?,language=?,circle=? WHERE id=?').run(u.name, u.phone, u.language, u.circle, u.id);
  res.json(u);
});

router.post('/me/password', auth, (req, res) => {
  const b = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(b.current || ''), u.password_hash)) throw new HttpError(401, 'Current password is wrong');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password(b.password), 10), u.id);
  res.json({ ok: true });
});

router.delete('/me', auth, (req, res) => {
  /* pets this user solely owns go with them; shared pets stay with the other owner */
  db.transaction(() => {
    const mine = db.prepare("SELECT pet_id FROM pet_members WHERE user_id=? AND role='owner'").all(req.user.id);
    mine.forEach((m) => {
      const others = db.prepare("SELECT COUNT(*) n FROM pet_members WHERE pet_id=? AND user_id<>? AND role='owner'").get(m.pet_id, req.user.id).n;
      if (!others) db.prepare('DELETE FROM pets WHERE id=?').run(m.pet_id);
    });
    db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  })();
  res.status(204).end();
});

/* emergency contacts, called in position order */
router.get('/contacts', auth, (req, res) =>
  res.json(db.prepare('SELECT id,name,kind,phone,position FROM contacts WHERE user_id=? ORDER BY position,id').all(req.user.id)));

router.post('/contacts', auth, (req, res) => {
  const b = req.body || {};
  const pos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM contacts WHERE user_id=?').get(req.user.id).p;
  const info = db.prepare('INSERT INTO contacts(user_id,name,kind,phone,position) VALUES(?,?,?,?,?)')
    .run(req.user.id, str(b.name, 'name', { max: 60 }), oneOf(b.kind || 'vet', ['hospital', 'vet', 'family', 'other'], 'kind'), str(b.phone, 'phone', { max: 20 }), pos);
  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id=?').get(info.lastInsertRowid));
});

router.put('/contacts/order', auth, (req, res) => {
  const ids = (req.body || {}).ids;
  if (!Array.isArray(ids)) throw bad('ids must be a list of contact ids');
  const up = db.prepare('UPDATE contacts SET position=? WHERE id=? AND user_id=?');
  db.transaction(() => ids.forEach((id, i) => up.run(i, id, req.user.id)))();
  res.json({ ok: true });
});

router.delete('/contacts/:cid', auth, (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id=? AND user_id=?').run(req.params.cid, req.user.id);
  res.status(204).end();
});

module.exports = router;
