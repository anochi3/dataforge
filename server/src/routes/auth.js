import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.includes('@') || !password || password.length < 8) {
    return res
      .status(400)
      .json({ error: 'Valid email and a password of 8+ characters required' });
  }
    try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'insert into users (email, password_hash) values ($1, $2) returning id, email',
      [email.toLowerCase(), passwordHash]
    );
    req.session.userId = rows[0].id;
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    'select id, email, password_hash from users where email = $1',
    [(email || '').toLowerCase()]
  );
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password || '', user.password_hash));

  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const { rows } = await pool.query(
    'select id, email from users where id = $1',
    [req.session.userId]
  );
  res.json(rows[0]);
});

export default router;