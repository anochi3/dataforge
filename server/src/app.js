import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import 'dotenv/config';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import datasetRoutes from './routes/datasets.js';
import annotationRoutes from './routes/annotations.js';

const app = express();
const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'session',
      // Switch off the background cleanup of expired sessions in tests: it could
      // run a query after the test code has already closed the connection pool.
      pruneSessionInterval: process.env.NODE_ENV === 'test' ? false : undefined,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set to true in production (HTTPS)
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
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
app.use('/api/datasets', annotationRoutes);

// last resort: log the error, don't leak details to the client
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;