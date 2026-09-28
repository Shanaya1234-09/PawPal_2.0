const express = require('express');
const db = require('../db');
const { auth } = require('../auth');
const { HttpError, str } = require('../util');

const router = express.Router();
router.use(auth);

const who = (n) => { const p = String(n).split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
const post = (r, me) => ({ id: r.id, author: who(r.name), circle: r.circle, body: r.body, createdAt: r.created_at, answers: r.n, mine: r.user_id === me });
const BASE = 'SELECT p.*, u.name, (SELECT COUNT(*) FROM answers a WHERE a.post_id=p.id) n FROM posts p JOIN users u ON u.id=p.user_id';

router.get('/', (req, res) => {
  const circle = req.query.circle || req.user.circle;
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20), before = parseInt(req.query.before, 10) || 1e12;
  res.json(db.prepare(BASE + ' WHERE p.circle=? AND p.id<? ORDER BY p.id DESC LIMIT ?').all(circle, before, limit).map((r) => post(r, req.user.id)));
});

router.post('/', (req, res) => {
  const info = db.prepare('INSERT INTO posts(user_id,circle,body) VALUES(?,?,?)')
    .run(req.user.id, str((req.body || {}).circle, 'circle', { max: 60, optional: true }) || req.user.circle, str((req.body || {}).body, 'body', { max: 240 }));
  res.status(201).json(post(db.prepare(BASE + ' WHERE p.id=?').get(info.lastInsertRowid), req.user.id));
});

router.get('/:pid', (req, res) => {
  const r = db.prepare(BASE + ' WHERE p.id=?').get(req.params.pid);
  if (!r) throw new HttpError(404, 'Post not found');
  const answers = db.prepare('SELECT a.id,a.body,a.created_at createdAt,a.user_id,u.name FROM answers a JOIN users u ON u.id=a.user_id WHERE a.post_id=? ORDER BY a.id').all(r.id)
    .map((a) => ({ id: a.id, author: who(a.name), body: a.body, createdAt: a.createdAt, mine: a.user_id === req.user.id }));
  res.json(Object.assign(post(r, req.user.id), { thread: answers }));
});

router.post('/:pid/answers', (req, res) => {
  if (!db.prepare('SELECT 1 FROM posts WHERE id=?').get(req.params.pid)) throw new HttpError(404, 'Post not found');
  const info = db.prepare('INSERT INTO answers(post_id,user_id,body) VALUES(?,?,?)').run(req.params.pid, req.user.id, str((req.body || {}).body, 'body', { max: 240 }));
  res.status(201).json({ id: info.lastInsertRowid, answers: db.prepare('SELECT COUNT(*) n FROM answers WHERE post_id=?').get(req.params.pid).n });
});

router.delete('/:pid', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id=? AND user_id=?').run(req.params.pid, req.user.id);
  res.status(204).end();
});

module.exports = router;
