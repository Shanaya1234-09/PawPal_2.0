/* Recreates the prototype's Aarav / Bruno / Mishti data.  Dev only:  npm run seed */
try { process.loadEnvFile(); } catch (e) {}
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { createPet } = require('../src/routes/pets');
const { addDays, local } = require('../src/util');

if (db.prepare("SELECT 1 FROM users WHERE email='aarav@pawpal.in'").get()) { console.log('Already seeded.'); process.exit(0); }

const u = db.prepare('INSERT INTO users(email,password_hash,name,phone) VALUES(?,?,?,?)')
  .run('aarav@pawpal.in', bcrypt.hashSync('pawpal123', 10), 'Aarav Sharma', '+91 98450 00000').lastInsertRowid;

const bruno = createPet(u, { name: 'Bruno', species: 'dog', breed: 'Indie', sex: 'male', years: 4, weight: 18.4, since: 'March 2022',
  allergies: 'Chicken, dust mites', grams: 360, lastSeen: 'Koramangala 5th Block', reward: '5,000', microchip: '985 112 004 118 902', bloodGroup: 'DEA 1.1 positive' });
createPet(u, { name: 'Mishti', species: 'cat', breed: 'Indian shorthair', sex: 'female', years: 2, weight: 4.2, since: 'July 2024', grams: 230,
  lastSeen: 'Koramangala 5th Block', reward: '3,000' });

const w = db.prepare('INSERT INTO weights(pet_id,kg,logged_at) VALUES(?,?,?)');
[[17.2, 150], [17.6, 120], [17.9, 90], [18.1, 60], [18.4, 30]].forEach((x) => w.run(bruno.id, x[0], new Date(Date.now() - x[1] * 864e5).toISOString().slice(0, 19).replace('T', ' ')));

const ex = db.prepare('INSERT INTO expenses(pet_id,category,amount,note,spent_on) VALUES(?,?,?,?,?)');
[['Food', 1650, 'Kibble 10 kg'], ['Vet', 890, 'Check-up'], ['Medicines', 300, 'Carprofen']].forEach((e) => ex.run(bruno.id, e[0], e[1], e[2], local().date));

db.prepare('INSERT INTO routines(pet_id,kind,title,detail,time) VALUES(?,?,?,?,?)').run(bruno.id, 'medicines', 'Carprofen', 'Half tablet · with food', '14:00');

const c = db.prepare('INSERT INTO contacts(user_id,name,kind,phone,position) VALUES(?,?,?,?,?)');
c.run(u, 'City Pet Hospital', 'hospital', '+91 80 4000 0001', 0); c.run(u, 'Dr. Menon', 'vet', '+91 98450 11111', 1); c.run(u, 'Meera', 'family', '+91 98450 22222', 2);

db.prepare('INSERT INTO records(pet_id,title,note,kind) VALUES(?,?,?,?)').run(bruno.id, 'Annual check', 'All clear, teeth good', 'visit');
db.prepare('INSERT INTO posts(user_id,circle,body) VALUES(?,?,?)').run(u, 'Koramangala Pets', 'Vet who is good with anxious dogs near 5th Block?');
console.log('Seeded. Sign in with aarav@pawpal.in / pawpal123');
