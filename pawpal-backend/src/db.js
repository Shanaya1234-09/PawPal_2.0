const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'pawpal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT, language TEXT NOT NULL DEFAULT 'en', circle TEXT NOT NULL DEFAULT 'Koramangala Pets',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS password_resets(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS pets(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, species TEXT NOT NULL, breed TEXT NOT NULL DEFAULT 'Not set',
  sex TEXT NOT NULL DEFAULT 'male', years REAL NOT NULL DEFAULT 1, weight REAL NOT NULL, since TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT 'None on file', grams INTEGER NOT NULL, last_seen TEXT, reward TEXT,
  microchip TEXT, blood_group TEXT, insurance TEXT, target_min REAL, target_max REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS pet_members(
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(pet_id, user_id));

CREATE TABLE IF NOT EXISTS invites(
  token TEXT PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  role TEXT NOT NULL, created_by INTEGER NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);

CREATE TABLE IF NOT EXISTS reminders(
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(pet_id, kind));

CREATE TABLE IF NOT EXISTS routines(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, time TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS thread_entries(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, at TEXT NOT NULL, day TEXT NOT NULL,
  done_at TEXT, routine_id INTEGER REFERENCES routines(id) ON DELETE SET NULL, vaccination_id INTEGER,
  UNIQUE(routine_id, day));
CREATE INDEX IF NOT EXISTS idx_thread ON thread_entries(pet_id, day, at);

CREATE TABLE IF NOT EXISTS weights(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kg REAL NOT NULL, logged_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS vaccinations(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name TEXT NOT NULL, due_date TEXT, given_date TEXT, clinic TEXT, booked_slot TEXT,
  status TEXT NOT NULL DEFAULT 'due' CHECK(status IN ('due','booked','given')));

CREATE TABLE IF NOT EXISTS records(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title TEXT NOT NULL, note TEXT, kind TEXT NOT NULL DEFAULT 'visit', created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  category TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT, spent_on TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_exp ON expenses(pet_id, spent_on);

CREATE TABLE IF NOT EXISTS contacts(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'vet', phone TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS hospitals(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  open_24h INTEGER NOT NULL DEFAULT 0, opens TEXT DEFAULT '09:00', closes TEXT DEFAULT '21:00');

CREATE TABLE IF NOT EXISTS calls(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE, user_id INTEGER NOT NULL,
  contact TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT (datetime('now')), ended_at TEXT, duration_s INTEGER,
  records_shared INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS share_tokens(
  token TEXT PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL, expires_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS poster_shares(
  id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL, groups TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circle TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS answers(
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

/* Sample hospitals so the emergency screen has something to show.
   Replace with a real places provider in production. */
if (!db.prepare('SELECT 1 FROM hospitals LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO hospitals(name,phone,lat,lng,open_24h,opens,closes) VALUES(?,?,?,?,?,?,?)');
  ins.run('City Pet Hospital', '+91 80 4000 0001', 12.9352, 77.6245, 1, '00:00', '23:59');
  ins.run('Paws Clinic', '+91 80 4000 0002', 12.9279, 77.6271, 0, '09:00', '21:00');
  ins.run('HSR Animal Care', '+91 80 4000 0003', 12.9116, 77.6474, 0, '08:00', '20:00');
}

module.exports = db;
