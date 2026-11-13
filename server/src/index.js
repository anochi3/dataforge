import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import 'dotenv/config';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import datasetRoutes from './routes/datasets.js';

const app = express();
const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('select now()');
    res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Database connection failed' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(process.env.PORT, () =>
  console.log(`API on http://localhost:${process.env.PORT}`)
);