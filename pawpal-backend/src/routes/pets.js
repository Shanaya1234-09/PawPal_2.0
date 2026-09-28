const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auth, petAccess } = require('../auth');
const { SPECIES, HttpError, bad, str, num, oneOf, date, stamp, local, addDays } = require('../util');

const router = express.Router();
router.use(auth);
const R = petAccess('viewer'), W = petAccess('editor'), O = petAccess('owner');

const KINDS = ['meals', 'medicines', 'vaccinations', 'walks', 'grooming'];
const CATS = [
  { name: 'Food', colour: '#23372B' }, { name: 'Vet', colour: '#E8A33D' }, { name: 'Medicines', colour: '#E7C8BE' },
  { name: 'Grooming', colour: '#C9C2B2' }, { name: 'Treats', colour: '#A9BBA2' }
];
const VAX = {
  dog: [['Rabies booster', 14], ['DHPP', 45], ['Leptospirosis', 75]],
  cat: [['Rabies booster', 14], ['FVRCP', 45]],
  rabbit: [], bird: []
};

const pub = (p) => ({
  id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, years: p.years, age: p.years + ' yr',
  weight: p.weight, since: p.since, allergies: p.allergies, grams: p.grams, lastSeen: p.last_seen, reward: p.reward,
  microchip: p.microchip, bloodGroup: p.blood_group, insurance: p.insurance, targetMin: p.target_min, targetMax: p.target_max,
  kcal: Math.round(p.weight * SPECIES[p.species].kcalPerKg), role: p.role
});
const defaultGrams = (kg) => Math.max(40, Math.round(kg * 19.5 / 10) * 10);
const mealDetail = (p, grams) => Math.round(grams / 2) + ' g ' + SPECIES[p.species].food;

function syncMeals(p, grams) {
  db.prepare("UPDATE routines SET detail=? WHERE pet_id=? AND kind='meals'").run(mealDetail(p, grams), p.id);
  /* today's not-yet-done meal entries follow the new portion */
  db.prepare("UPDATE thread_entries SET detail=? WHERE pet_id=? AND kind='meals' AND done_at IS NULL AND day>=?")
    .run(mealDetail(p, grams), p.id, local().date);
}

function createPet(userId, b) {
  const name = str(b.name, 'name', { max: 40 });
  const species = oneOf(b.species || 'dog', Object.keys(SPECIES), 'species');
  const weight = num(b.weight != null ? b.weight : (species === 'dog' ? 12 : 4), 'weight', { min: 0.05, max: 120 });
  const grams = b.grams != null ? num(b.grams, 'grams', { min: 5, max: 3000 }) : defaultGrams(weight);
  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO pets(name,species,breed,sex,years,weight,since,allergies,grams,last_seen,reward,microchip,blood_group,insurance,target_min,target_max)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      name, species, str(b.breed, 'breed', { max: 60, optional: true }) || 'Not set',
      oneOf(b.sex || 'male', ['male', 'female'], 'sex'), num(b.years, 'years', { min: 0, max: 40, optional: true }) || 1,
      weight, str(b.since, 'since', { max: 40, optional: true }) || 'Today',
      str(b.allergies, 'allergies', { max: 120, optional: true }) || 'None on file', grams,
      str(b.lastSeen, 'lastSeen', { max: 120, optional: true }), str(b.reward, 'reward', { max: 20, optional: true }),
      str(b.microchip, 'microchip', { max: 30, optional: true }), str(b.bloodGroup, 'bloodGroup', { max: 20, optional: true }),
      str(b.insurance, 'insurance', { max: 80, optional: true }),
      Math.round(weight * 0.9 * 10) / 10, Math.round(weight * 1.1 * 10) / 10);
    const id = info.lastInsertRowid;
    db.prepare("INSERT INTO pet_members VALUES(?,?, 'owner')").run(id, userId);
    db.prepare('INSERT INTO weights(pet_id,kg) VALUES(?,?)').run(id, weight);
    const on = Array.isArray(b.reminders) ? b.reminders : ['meals', 'medicines', 'vaccinations'];
    KINDS.forEach((k) => db.prepare('INSERT INTO reminders VALUES(?,?,?)').run(id, k, on.includes(k) ? 1 : 0));
    const p = db.prepare('SELECT p.*, m.role FROM pets p JOIN pet_members m ON m.pet_id=p.id AND m.user_id=? WHERE p.id=?').get(userId, id);
    const ins = db.prepare('INSERT INTO routines(pet_id,kind,title,detail,time) VALUES(?,?,?,?,?)');
    ins.run(id, 'meals', 'Breakfast', mealDetail(p, grams), '07:30');
    ins.run(id, 'meals', 'Dinner', mealDetail(p, grams), '19:00');
    (VAX[species] || []).forEach((v) => db.prepare('INSERT INTO vaccinations(pet_id,name,due_date) VALUES(?,?,?)').run(id, v[0], addDays(v[1])));
    return p;
  })();
}

/* materialise today's routines into the thread, once per routine per day */
function materialise(petId, day) {
  db.prepare(`INSERT OR IGNORE INTO thread_entries(pet_id,kind,title,detail,at,day,routine_id)
    SELECT r.pet_id,r.kind,r.title,r.detail,?||' '||r.time,?,r.id FROM routines r
    JOIN reminders m ON m.pet_id=r.pet_id AND m.kind=r.kind AND m.enabled=1 WHERE r.pet_id=?`).run(day, day, petId);
}

/* ---------------- pets ---------------- */
router.get('/', (req, res) => res.json(db.prepare(
  'SELECT p.*, m.role FROM pets p JOIN pet_members m ON m.pet_id=p.id WHERE m.user_id=? ORDER BY p.id').all(req.user.id).map(pub)));

router.post('/', (req, res) => res.status(201).json(pub(createPet(req.user.id, req.body || {}))));

router.get('/:id', R, (req, res) => res.json(pub(req.pet)));

router.patch('/:id', W, (req, res) => {
  const b = req.body || {}, s = {};
  if ('name' in b) s.name = str(b.name, 'name', { max: 40 });
  if ('species' in b) s.species = oneOf(b.species, Object.keys(SPECIES), 'species');
  if ('breed' in b) s.breed = str(b.breed, 'breed', { max: 60 });
  if ('sex' in b) s.sex = oneOf(b.sex, ['male', 'female'], 'sex');
  if ('years' in b) s.years = num(b.years, 'years', { min: 0, max: 40 });
  if ('weight' in b) s.weight = num(b.weight, 'weight', { min: 0.05, max: 120 });
  if ('grams' in b) s.grams = Math.round(num(b.grams, 'grams', { min: 5, max: 3000 }));
  if ('since' in b) s.since = str(b.since, 'since', { max: 40 });
  if ('allergies' in b) s.allergies = str(b.allergies, 'allergies', { max: 120, optional: true }) || 'None on file';
  if ('lastSeen' in b) s.last_seen = str(b.lastSeen, 'lastSeen', { max: 120, optional: true });
  if ('reward' in b) s.reward = str(b.reward, 'reward', { max: 20, optional: true });
  if ('microchip' in b) s.microchip = str(b.microchip, 'microchip', { max: 30, optional: true });
  if ('bloodGroup' in b) s.blood_group = str(b.bloodGroup, 'bloodGroup', { max: 20, optional: true });
  if ('insurance' in b) s.insurance = str(b.insurance, 'insurance', { max: 80, optional: true });
  if ('targetMin' in b) s.target_min = num(b.targetMin, 'targetMin', { min: 0, max: 120 });
  if ('targetMax' in b) s.target_max = num(b.targetMax, 'targetMax', { min: 0, max: 120 });
  const cols = Object.keys(s);
  if (!cols.length) throw bad('Nothing to update');
  db.transaction(() => {
    db.prepare('UPDATE pets SET ' + cols.map((c) => c + '=@' + c).join(',') + ' WHERE id=@id').run(Object.assign({ id: req.pet.id }, s));
    if (s.weight != null && s.weight !== req.pet.weight) db.prepare('INSERT INTO weights(pet_id,kg) VALUES(?,?)').run(req.pet.id, s.weight);
    const p = db.prepare('SELECT * FROM pets WHERE id=?').get(req.pet.id);
    if (s.grams != null || s.species) syncMeals(p, p.grams);
  })();
  res.json(pub(Object.assign(db.prepare('SELECT * FROM pets WHERE id=?').get(req.pet.id), { role: req.pet.role })));
});

router.delete('/:id', O, (req, res) => { db.prepare('DELETE FROM pets WHERE id=?').run(req.pet.id); res.status(204).end(); });

/* ---------------- care thread ---------------- */
const entryOut = (e, today, nowStamp) => ({
  id: e.id, kind: e.kind, title: e.title, detail: e.detail, at: e.at, doneAt: e.done_at,
  status: e.done_at ? 'done' : (e.day === today && e.at < nowStamp ? 'overdue' : 'upcoming')
});

router.get('/:id/thread', R, (req, res) => {
  const n = local();
  const day = req.query.date ? date(req.query.date, 'date') : n.date;
  if (day >= n.date) materialise(req.pet.id, day);
  const rows = db.prepare('SELECT * FROM thread_entries WHERE pet_id=? AND day=? ORDER BY at,id').all(req.pet.id, day);
  res.json({ day, now: day === n.date ? n.stamp : null, entries: rows.map((e) => entryOut(e, n.date, n.stamp)) });
});

router.post('/:id/thread', W, (req, res) => {
  const b = req.body || {}, n = local();
  const at = b.at ? stamp(b.at, 'at') : n.stamp;
  const info = db.prepare('INSERT INTO thread_entries(pet_id,kind,title,detail,at,day,done_at) VALUES(?,?,?,?,?,?,?)').run(
    req.pet.id, oneOf(b.kind || 'note', ['meals', 'medicines', 'walks', 'grooming', 'vaccinations', 'note'], 'kind'),
    str(b.title, 'title', { max: 80 }), str(b.detail, 'detail', { max: 200, optional: true }), at, at.slice(0, 10), b.done ? n.stamp : null);
  res.status(201).json(entryOut(db.prepare('SELECT * FROM thread_entries WHERE id=?').get(info.lastInsertRowid), n.date, n.stamp));
});

router.patch('/:id/thread/:eid', W, (req, res) => {
  const e = db.prepare('SELECT * FROM thread_entries WHERE id=? AND pet_id=?').get(req.params.eid, req.pet.id);
  if (!e) throw new HttpError(404, 'Entry not found');
  const n = local();
  if ('done' in req.body) db.prepare('UPDATE thread_entries SET done_at=? WHERE id=?').run(req.body.done ? n.stamp : null, e.id);
  res.json(entryOut(db.prepare('SELECT * FROM thread_entries WHERE id=?').get(e.id), n.date, n.stamp));
});

router.delete('/:id/thread/:eid', W, (req, res) => {
  db.prepare('DELETE FROM thread_entries WHERE id=? AND pet_id=?').run(req.params.eid, req.pet.id);
  res.status(204).end();
});

/* ---------------- vaccinations ---------------- */
router.get('/:id/vaccinations', R, (req, res) => res.json(db.prepare(
  "SELECT * FROM vaccinations WHERE pet_id=? ORDER BY status='given', COALESCE(due_date,given_date)").all(req.pet.id)));

router.post('/:id/vaccinations', W, (req, res) => {
  const b = req.body || {};
  const info = db.prepare('INSERT INTO vaccinations(pet_id,name,due_date) VALUES(?,?,?)')
    .run(req.pet.id, str(b.name, 'name', { max: 60 }), date(b.dueDate, 'dueDate'));
  res.status(201).json(db.prepare('SELECT * FROM vaccinations WHERE id=?').get(info.lastInsertRowid));
});

function vax(req) {
  const v = db.prepare('SELECT * FROM vaccinations WHERE id=? AND pet_id=?').get(req.params.vid, req.pet.id);
  if (!v) throw new HttpError(404, 'Vaccination not found');
  return v;
}

router.post('/:id/vaccinations/:vid/book', W, (req, res) => {
  const v = vax(req), b = req.body || {};
  if (v.status === 'given') throw bad('Already given');
  const slot = stamp(b.slot, 'slot'), clinic = str(b.clinic, 'clinic', { max: 80, optional: true }) || 'Paws Clinic';
  db.transaction(() => {
    db.prepare("UPDATE vaccinations SET status='booked',booked_slot=?,clinic=? WHERE id=?").run(slot, clinic, v.id);
    db.prepare('DELETE FROM thread_entries WHERE vaccination_id=? AND done_at IS NULL').run(v.id);
    db.prepare("INSERT INTO thread_entries(pet_id,kind,title,detail,at,day,vaccination_id) VALUES(?,?,?,?,?,?,?)")
      .run(req.pet.id, 'vaccinations', v.name, clinic, slot, slot.slice(0, 10), v.id);
  })();
  res.json(db.prepare('SELECT * FROM vaccinations WHERE id=?').get(v.id));
});

router.post('/:id/vaccinations/:vid/given', W, (req, res) => {
  const v = vax(req), d = req.body && req.body.date ? date(req.body.date, 'date') : local().date;
  db.transaction(() => {
    db.prepare("UPDATE vaccinations SET status='given',given_date=? WHERE id=?").run(d, v.id);
    db.prepare('UPDATE thread_entries SET done_at=? WHERE vaccination_id=?').run(local().stamp, v.id);
    db.prepare('INSERT INTO records(pet_id,title,note,kind) VALUES(?,?,?,?)').run(req.pet.id, v.name + ' given', v.clinic, 'vaccination');
  })();
  res.json(db.prepare('SELECT * FROM vaccinations WHERE id=?').get(v.id));
});

/* ---------------- records ---------------- */
router.get('/:id/records', R, (req, res) => res.json(db.prepare(
  'SELECT id,title,note,kind,created_at createdAt FROM records WHERE pet_id=? ORDER BY id DESC').all(req.pet.id)));

router.post('/:id/records', W, (req, res) => {
  const b = req.body || {};
  const info = db.prepare('INSERT INTO records(pet_id,title,note,kind) VALUES(?,?,?,?)').run(req.pet.id,
    str(b.title, 'title', { max: 80 }), str(b.note, 'note', { max: 48 * 4, optional: true }),
    oneOf(b.kind || 'visit', ['visit', 'vaccination', 'lab', 'prescription', 'document'], 'kind'));
  res.status(201).json(db.prepare('SELECT id,title,note,kind,created_at createdAt FROM records WHERE id=?').get(info.lastInsertRowid));
});

router.delete('/:id/records/:rid', W, (req, res) => {
  db.prepare('DELETE FROM records WHERE id=? AND pet_id=?').run(req.params.rid, req.pet.id);
  res.status(204).end();
});

/* ---------------- weight and growth ---------------- */
router.get('/:id/weights', R, (req, res) => {
  const pts = db.prepare('SELECT id,kg,logged_at loggedAt FROM weights WHERE pet_id=? ORDER BY logged_at,id').all(req.pet.id);
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const old = pts.filter((p) => p.loggedAt <= cutoff).pop() || pts[0];
  res.json({ current: req.pet.weight, band: { min: req.pet.target_min, max: req.pet.target_max },
    change30d: Math.round((req.pet.weight - old.kg) * 10) / 10, points: pts });
});

router.post('/:id/weights', W, (req, res) => {
  const kg = Math.round(num((req.body || {}).kg, 'kg', { min: 0.05, max: 120 }) * 10) / 10, n = local();
  db.transaction(() => {
    db.prepare('INSERT INTO weights(pet_id,kg) VALUES(?,?)').run(req.pet.id, kg);
    db.prepare('UPDATE pets SET weight=? WHERE id=?').run(kg, req.pet.id);
    db.prepare('INSERT INTO thread_entries(pet_id,kind,title,detail,at,day,done_at) VALUES(?,?,?,?,?,?,?)')
      .run(req.pet.id, 'note', 'Weight logged', kg.toFixed(1) + ' kg', n.stamp, n.date, n.stamp);
  })();
  res.status(201).json({ kg, kcal: Math.round(kg * SPECIES[req.pet.species].kcalPerKg) });
});

/* ---------------- feeding ---------------- */
router.get('/:id/feeding', R, (req, res) => {
  const p = req.pet, sp = SPECIES[p.species];
  const allergies = /^none/i.test(p.allergies) ? [] : p.allergies.split(',').map((s) => s.trim()).filter(Boolean);
  res.json({ grams: p.grams, kcal: Math.round(p.weight * sp.kcalPerKg), food: sp.food,
    meals: db.prepare("SELECT id,title,time FROM routines WHERE pet_id=? AND kind='meals' ORDER BY time").all(p.id)
      .map((m) => ({ id: m.id, title: m.title, time: m.time, grams: Math.round(p.grams / 2) })),
    avoid: allergies.concat(sp.avoid) });
});

router.patch('/:id/feeding', W, (req, res) => {
  const grams = Math.round(num((req.body || {}).grams, 'grams', { min: 5, max: 3000 }));
  db.transaction(() => { db.prepare('UPDATE pets SET grams=? WHERE id=?').run(grams, req.pet.id); syncMeals(req.pet, grams); })();
  res.json({ grams, kcal: Math.round(req.pet.weight * SPECIES[req.pet.species].kcalPerKg) });
});

/* ---------------- spending ---------------- */
router.get('/:id/expenses', R, (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : local().date.slice(0, 7);
  const sums = db.prepare("SELECT category, SUM(amount) v FROM expenses WHERE pet_id=? AND substr(spent_on,1,7)=? GROUP BY category").all(req.pet.id, month);
  const total = sums.reduce((a, s) => a + s.v, 0);
  res.json({ month, total,
    categories: CATS.map((c) => { const v = (sums.find((s) => s.category === c.name) || {}).v || 0;
      return { name: c.name, colour: c.colour, value: v, share: total ? Math.round(v / total * 1000) / 10 : 0 }; }),
    items: db.prepare("SELECT id,category,amount,note,spent_on spentOn FROM expenses WHERE pet_id=? AND substr(spent_on,1,7)=? ORDER BY spent_on DESC,id DESC").all(req.pet.id, month) });
});

router.post('/:id/expenses', W, (req, res) => {
  const b = req.body || {};
  const info = db.prepare('INSERT INTO expenses(pet_id,category,amount,note,spent_on) VALUES(?,?,?,?,?)').run(req.pet.id,
    oneOf(b.category, CATS.map((c) => c.name), 'category'), Math.round(num(b.amount, 'amount', { min: 1, max: 999999 })),
    str(b.note, 'note', { max: 80, optional: true }), b.spentOn ? date(b.spentOn, 'spentOn') : local().date);
  res.status(201).json(db.prepare('SELECT id,category,amount,note,spent_on spentOn FROM expenses WHERE id=?').get(info.lastInsertRowid));
});

router.delete('/:id/expenses/:xid', W, (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id=? AND pet_id=?').run(req.params.xid, req.pet.id);
  res.status(204).end();
});

/* ---------------- reminders ---------------- */
router.get('/:id/reminders', R, (req, res) => res.json(db.prepare('SELECT kind,enabled FROM reminders WHERE pet_id=?').all(req.pet.id)
  .reduce((o, r) => { o[r.kind] = !!r.enabled; return o; }, {})));

router.put('/:id/reminders', W, (req, res) => {
  const b = req.body || {};
  db.transaction(() => KINDS.forEach((k) => { if (k in b) db.prepare('UPDATE reminders SET enabled=? WHERE pet_id=? AND kind=?').run(b[k] ? 1 : 0, req.pet.id, k); }))();
  res.json({ ok: true });
});

/* ---------------- family sharing ---------------- */
router.get('/:id/family', R, (req, res) => res.json(db.prepare(
  'SELECT u.id,u.name,u.email,m.role FROM pet_members m JOIN users u ON u.id=m.user_id WHERE m.pet_id=? ORDER BY m.role=\'owner\' DESC,u.name').all(req.pet.id)));

router.post('/:id/family/invite', O, (req, res) => {
  const token = crypto.randomBytes(18).toString('hex');
  db.prepare('INSERT INTO invites VALUES(?,?,?,?,?,NULL)').run(token, req.pet.id,
    oneOf((req.body || {}).role || 'editor', ['editor', 'viewer'], 'role'), req.user.id, new Date(Date.now() + 7 * 864e5).toISOString());
  res.status(201).json({ token, expiresInDays: 7 });
});

router.delete('/:id/family/:uid', O, (req, res) => {
  if (Number(req.params.uid) === req.user.id) throw bad('Owners cannot remove themselves');
  db.prepare('DELETE FROM pet_members WHERE pet_id=? AND user_id=?').run(req.pet.id, req.params.uid);
  res.status(204).end();
});

router.post('/invites/:token/accept', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token=? AND used_at IS NULL').get(req.params.token);
  if (!inv || inv.expires_at < new Date().toISOString()) throw new HttpError(410, 'This invite has expired');
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO pet_members VALUES(?,?,?)').run(inv.pet_id, req.user.id, inv.role);
    db.prepare("UPDATE invites SET used_at=datetime('now') WHERE token=?").run(inv.token);
  })();
  res.json({ petId: inv.pet_id, role: inv.role });
});

/* ---------------- lost poster ---------------- */
router.get('/:id/poster', R, (req, res) => {
  const p = req.pet, owner = db.prepare("SELECT u.name,u.phone FROM pet_members m JOIN users u ON u.id=m.user_id WHERE m.pet_id=? AND m.role='owner' LIMIT 1").get(p.id);
  const text = 'LOST ' + p.species.toUpperCase() + ': ' + p.name + ' (' + p.breed + '). Last seen ' + (p.last_seen || 'unknown') +
    '. ' + (p.reward ? 'Reward ₹' + p.reward + '. ' : '') + 'Call ' + owner.name + (owner.phone ? ' ' + owner.phone : '') + '.';
  res.json({ name: p.name, species: p.species, breed: p.breed, sex: p.sex, age: p.years + ' yr', lastSeen: p.last_seen,
    reward: p.reward, contact: owner, text, whatsappUrl: 'https://wa.me/?text=' + encodeURIComponent(text) });
});

router.post('/:id/poster/share', W, (req, res) => {
  const groups = (req.body || {}).groups;
  if (!Array.isArray(groups) || !groups.length || groups.length > 10) throw bad('Choose at least one group');
  db.prepare('INSERT INTO poster_shares(pet_id,user_id,groups) VALUES(?,?,?)').run(req.pet.id, req.user.id, JSON.stringify(groups.map(String)));
  res.status(201).json({ shared: groups.length });
});

/* ---------------- export everything ---------------- */
router.get('/:id/export', R, (req, res) => {
  const id = req.pet.id, all = (t) => db.prepare('SELECT * FROM ' + t + ' WHERE pet_id=?').all(id);
  res.setHeader('Content-Disposition', 'attachment; filename="' + req.pet.name.replace(/[^\w-]/g, '_') + '-pawpal.json"');
  res.json({ exportedAt: new Date().toISOString(), pet: pub(req.pet), weights: all('weights'), vaccinations: all('vaccinations'),
    records: all('records'), expenses: all('expenses'), thread: all('thread_entries'), routines: all('routines') });
});

module.exports = { router, createPet, pub };
