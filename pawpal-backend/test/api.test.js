process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');

let srv, base, tok, petId;
const call = async (m, p, b, t) => {
  const r = await fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, (t || tok) ? { authorization: 'Bearer ' + (t || tok) } : {}), body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

test.before(() => new Promise((ok) => { srv = app.listen(0, () => { base = 'http://127.0.0.1:' + srv.address().port; ok(); }); }));
test.after(() => { srv.closeAllConnections(); srv.close(); });

test('auth: register, duplicate, login, bad password, protected routes', async () => {
  let r = await call('POST', '/api/auth/register', { name: 'Aarav', email: 'a@x.in', password: 'longenough1' });
  assert.equal(r.status, 201); tok = r.body.token;
  assert.equal((await call('POST', '/api/auth/register', { name: 'A', email: 'A@x.in', password: 'longenough1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { email: 'a@x.in', password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'a@x.in', password: 'longenough1' })).status, 200);
  assert.equal((await call('GET', '/api/pets', null, 'nope')).status, 401);
});

test('pets: create with defaults, thread materialises, mark done', async () => {
  let r = await call('POST', '/api/pets', { name: 'Bruno', species: 'dog', weight: 18.4, sex: 'male' });
  assert.equal(r.status, 201); petId = r.body.id;
  assert.equal(r.body.grams, 360); assert.equal(r.body.kcal, 1233);
  r = await call('GET', '/api/pets/' + petId + '/thread');
  assert.equal(r.body.entries.filter((e) => e.kind === 'meals').length, 2);
  const id = r.body.entries[0].id;
  r = await call('PATCH', '/api/pets/' + petId + '/thread/' + id, { done: true });
  assert.equal(r.body.status, 'done');
  r = await call('GET', '/api/pets/' + petId + '/thread'); // idempotent
  assert.equal(r.body.entries.filter((e) => e.kind === 'meals').length, 2);
});

test('weight, feeding, spending', async () => {
  let r = await call('POST', '/api/pets/' + petId + '/weights', { kg: 18.9 });
  assert.equal(r.status, 201);
  assert.equal((await call('GET', '/api/pets/' + petId)).body.weight, 18.9);
  r = await call('GET', '/api/pets/' + petId + '/weights'); assert.equal(r.body.points.length, 2);
  r = await call('PATCH', '/api/pets/' + petId + '/feeding', { grams: 400 }); assert.equal(r.body.grams, 400);
  r = await call('GET', '/api/pets/' + petId + '/feeding'); assert.equal(r.body.meals[0].grams, 200);
  await call('POST', '/api/pets/' + petId + '/expenses', { category: 'Food', amount: 1650 });
  await call('POST', '/api/pets/' + petId + '/expenses', { category: 'Vet', amount: 850 });
  r = await call('GET', '/api/pets/' + petId + '/expenses'); assert.equal(r.body.total, 2500);
  assert.equal((await call('POST', '/api/pets/' + petId + '/expenses', { category: 'Nope', amount: 5 })).status, 400);
});

test('vaccinations: book joins the thread, then given files a record', async () => {
  const v = (await call('GET', '/api/pets/' + petId + '/vaccinations')).body[0];
  const day = new Date().toISOString().slice(0, 10);
  let r = await call('POST', '/api/pets/' + petId + '/vaccinations/' + v.id + '/book', { slot: day + ' 23:00', clinic: 'Paws Clinic' });
  assert.equal(r.body.status, 'booked');
  const t = await call('GET', '/api/pets/' + petId + '/thread?date=' + day);
  assert.ok(t.body.entries.some((e) => e.kind === 'vaccinations'));
  await call('POST', '/api/pets/' + petId + '/vaccinations/' + v.id + '/given', {});
  assert.equal((await call('GET', '/api/pets/' + petId + '/records')).body.length, 1);
});

test('access control: strangers cannot see a pet; invited family can', async () => {
  const b = (await call('POST', '/api/auth/register', { name: 'Meera K', email: 'm@x.in', password: 'longenough1' }, '')).body;
  assert.equal((await call('GET', '/api/pets/' + petId, null, b.token)).status, 404);
  const inv = (await call('POST', '/api/pets/' + petId + '/family/invite', { role: 'viewer' })).body;
  assert.equal((await call('POST', '/api/pets/invites/' + inv.token + '/accept', null, b.token)).status, 200);
  assert.equal((await call('GET', '/api/pets/' + petId, null, b.token)).status, 200);
  assert.equal((await call('PATCH', '/api/pets/' + petId, { name: 'X' }, b.token)).status, 403);
});

test('community: ask, answer, count', async () => {
  const p = (await call('POST', '/api/community', { body: 'Good vet for anxious cats?' })).body;
  await call('POST', '/api/community/' + p.id + '/answers', { body: 'Dr. Menon' });
  const list = (await call('GET', '/api/community')).body;
  assert.equal(list[0].answers, 1); assert.equal(list[0].mine, true);
});

test('emergency: nearest open hospital, call log, share link', async () => {
  let r = await call('GET', '/api/pets/' + petId + '/emergency');
  assert.equal(r.body.nearest.open, true); assert.equal(r.body.card.weight, 18.9);
  const c = (await call('POST', '/api/pets/' + petId + '/emergency/calls', { contact: 'City Pet Hospital', shareRecords: true })).body;
  assert.equal((await call('PATCH', '/api/pets/' + petId + '/emergency/calls/' + c.id, {})).status, 200);
  const s = (await call('POST', '/api/pets/' + petId + '/emergency/share')).body;
  const pubRes = await fetch(base + s.path); // no auth needed
  assert.equal(pubRes.status, 200);
});

test('assistant: scripted answer and red-flag escalation', async () => {
  let r = await call('POST', '/api/pets/' + petId + '/assistant', { question: 'He is not eating since last night' });
  assert.equal(r.status, 200); assert.equal(r.body.urgency, 'soon'); assert.equal(r.body.emergency, false);
  r = await call('POST', '/api/pets/' + petId + '/assistant', { question: 'He ate chocolate' });
  assert.equal(r.body.emergency, true);
});

test('poster, reminders, export, delete', async () => {
  assert.match((await call('GET', '/api/pets/' + petId + '/poster')).body.text, /LOST DOG: Bruno/);
  await call('PUT', '/api/pets/' + petId + '/reminders', { meals: false });
  const d = new Date(Date.now() + 864e5 * 3).toISOString().slice(0, 10);
  assert.equal((await call('GET', '/api/pets/' + petId + '/thread?date=' + d)).body.entries.length, 0);
  assert.equal((await call('GET', '/api/pets/' + petId + '/export')).status, 200);
  assert.equal((await call('DELETE', '/api/pets/' + petId)).status, 204);
});
