const TZ = process.env.APP_TZ || 'Asia/Kolkata';

const SPECIES = {
  dog:    { kcalPerKg: 67, food: 'kibble',   avoid: ['Chocolate', 'Grapes and raisins', 'Onion and garlic', 'Xylitol (sugar-free gum)', 'Macadamia nuts'] },
  cat:    { kcalPerKg: 60, food: 'wet food', avoid: ['Onion and garlic', 'Chocolate', 'Lilies (toxic)', 'Cow’s milk', 'Raw dough'] },
  rabbit: { kcalPerKg: 45, food: 'pellets',  avoid: ['Iceberg lettuce', 'Chocolate', 'Avocado', 'Onion and garlic', 'Sugary treats'] },
  bird:   { kcalPerKg: 80, food: 'seed mix', avoid: ['Avocado', 'Chocolate', 'Caffeine', 'Salty snacks', 'Onion and garlic'] }
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

function str(v, name, { min = 1, max = 200, optional = false } = {}) {
  if (v === undefined || v === null || v === '') { if (optional) return null; throw bad(name + ' is required'); }
  if (typeof v !== 'string') throw bad(name + ' must be text');
  v = v.trim();
  if (v.length < min || v.length > max) throw bad(name + ' must be ' + min + '-' + max + ' characters');
  return v;
}
function num(v, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (v === undefined || v === null || v === '') { if (optional) return null; throw bad(name + ' is required'); }
  v = Number(v);
  if (!Number.isFinite(v) || v < min || v > max) throw bad(name + ' must be a number between ' + min + ' and ' + max);
  return v;
}
function oneOf(v, list, name) {
  if (!list.includes(v)) throw bad(name + ' must be one of: ' + list.join(', '));
  return v;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function date(v, name) { if (!DATE_RE.test(v || '')) throw bad(name + ' must be YYYY-MM-DD'); return v; }
function stamp(v, name) { if (!STAMP_RE.test(v || '')) throw bad(name + ' must be YYYY-MM-DD HH:MM'); return v; }

/* wall-clock time in the app's timezone, as sortable strings */
function local(d) {
  const s = (d || new Date()).toLocaleString('sv-SE', { timeZone: TZ, hour12: false });
  return { date: s.slice(0, 10), time: s.slice(11, 16), stamp: s.slice(0, 16) };
}
function addDays(days) { return local(new Date(Date.now() + days * 864e5)).date; }

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { SPECIES, HttpError, bad, str, num, oneOf, date, stamp, local, addDays, ah, TZ };
