import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db.js';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors({origin: 'http://localhost:5173', credentials: true}));

app.get('/api/health', async (req, res) => {
  const { rows } = await pool.query('select now()');
  res.json({ ok: true, time: rows[0].now });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});