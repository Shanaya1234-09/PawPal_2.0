const jwt = require('jsonwebtoken');
const db = require('./db');
const { HttpError } = require('./util');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

const sign = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: '14d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required');
  let payload;
  try { payload = jwt.verify(h.slice(7), SECRET); } catch (e) { throw new HttpError(401, 'Session expired, sign in again'); }
  const user = db.prepare('SELECT id,email,name,phone,language,circle FROM users WHERE id=?').get(payload.sub);
  if (!user) throw new HttpError(401, 'Account not found');
  req.user = user;
  next();
}

const RANK = { viewer: 1, editor: 2, owner: 3 };
/* loads :id as a pet the caller belongs to, and checks their role */
function petAccess(min) {
  return (req, res, next) => {
    const row = db.prepare(
      'SELECT p.*, m.role FROM pets p JOIN pet_members m ON m.pet_id=p.id WHERE p.id=? AND m.user_id=?'
    ).get(req.params.id, req.user.id);
    if (!row) throw new HttpError(404, 'Pet not found');
    if (RANK[row.role] < RANK[min]) throw new HttpError(403, 'You only have ' + row.role + ' access to this pet');
    req.pet = row;
    next();
  };
}

module.exports = { sign, auth, petAccess };
