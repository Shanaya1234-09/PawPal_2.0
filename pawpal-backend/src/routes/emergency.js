const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auth, petAccess } = require('../auth');
const { HttpError, bad, str, num, local } = require('../util');

const R = petAccess('viewer'), W = petAccess('editor');
const router = express.Router();      // authenticated, mounted at /api/pets
const pub = express.Router();         // public, mounted at /api

const km = (a, b, c, d) => {
  const t = (x) => x * Math.PI / 180, h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const isOpen = (h, hhmm) => !!h.open_24h || (h.opens <= hhmm && hhmm < h.closes);

/* nearest hospitals that are open right now; closed ones are returned last, flagged */
function nearby(lat, lng) {
  const t = local().time;
  return db.prepare('SELECT * FROM hospitals').all()
    .map((h) => ({ id: h.id, name: h.name, phone: h.phone, distanceKm: Math.round(km(lat, lng, h.lat, h.lng) * 10) / 10, open: isOpen(h, t) }))
    .sort((a, b) => (b.open - a.open) || (a.distanceKm - b.distanceKm));
}

function card(p) {
  const meds = db.prepare("SELECT title,detail,time FROM routines WHERE pet_id=? AND kind='medicines' ORDER BY time").all(p.id);
  return { name: p.name, species: p.species, breed: p.breed, sex: p.sex, age: p.years + ' yr', weight: p.weight,
    allergies: p.allergies, bloodGroup: p.blood_group, microchip: p.microchip, medication: meds };
}

router.get('/:id/emergency', R, (req, res) => {
  const lat = req.query.lat != null ? num(req.query.lat, 'lat', { min: -90, max: 90 }) : 12.9352;
  const lng = req.query.lng != null ? num(req.query.lng, 'lng', { min: -180, max: 180 }) : 77.6245;
  const hospitals = nearby(lat, lng);
  res.json({ card: card(req.pet), nearest: hospitals[0] || null, hospitals,
    contacts: db.prepare('SELECT id,name,kind,phone FROM contacts WHERE user_id=? ORDER BY position,id').all(req.user.id) });
});

/* the call timer on the emergency screen */
router.post('/:id/emergency/calls', W, (req, res) => {
  const b = req.body || {};
  const info = db.prepare('INSERT INTO calls(pet_id,user_id,contact,records_shared) VALUES(?,?,?,?)')
    .run(req.pet.id, req.user.id, str(b.contact, 'contact', { max: 80 }), b.shareRecords ? 1 : 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id/emergency/calls/:cid', W, (req, res) => {
  const c = db.prepare('SELECT * FROM calls WHERE id=? AND pet_id=?').get(req.params.cid, req.pet.id);
  if (!c) throw new HttpError(404, 'Call not found');
  const secs = Math.max(0, Math.round((Date.now() - new Date(c.started_at.replace(' ', 'T') + 'Z')) / 1000));
  db.prepare("UPDATE calls SET ended_at=datetime('now'),duration_s=? WHERE id=? AND ended_at IS NULL").run(secs, c.id);
  res.json(db.prepare('SELECT id,contact,duration_s durationSeconds,records_shared recordsShared FROM calls WHERE id=?').get(c.id));
});

/* a read-only link for whoever answers the phone; expires in 24 hours */
router.post('/:id/emergency/share', W, (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO share_tokens VALUES(?,?,?,?)').run(token, req.pet.id, req.user.id, new Date(Date.now() + 864e5).toISOString());
  res.status(201).json({ token, path: '/api/share/' + token, expiresInHours: 24 });
});

pub.get('/share/:token', (req, res) => {
  const t = db.prepare('SELECT * FROM share_tokens WHERE token=?').get(req.params.token);
  if (!t || t.expires_at < new Date().toISOString()) throw new HttpError(410, 'This link has expired');
  const p = db.prepare('SELECT * FROM pets WHERE id=?').get(t.pet_id);
  const owner = db.prepare("SELECT u.name,u.phone FROM pet_members m JOIN users u ON u.id=m.user_id WHERE m.pet_id=? AND m.role='owner' LIMIT 1").get(p.id);
  res.json({ card: card(p), owner,
    vaccinations: db.prepare("SELECT name,given_date givenDate FROM vaccinations WHERE pet_id=? AND status='given'").all(p.id),
    records: db.prepare('SELECT title,note,created_at createdAt FROM records WHERE pet_id=? ORDER BY id DESC LIMIT 10').all(p.id) });
});

pub.get('/hospitals/nearby', auth, (req, res) => {
  if (req.query.lat == null || req.query.lng == null) throw bad('lat and lng are required');
  res.json(nearby(num(req.query.lat, 'lat', { min: -90, max: 90 }), num(req.query.lng, 'lng', { min: -180, max: 180 })));
});

module.exports = { router, public: pub };
