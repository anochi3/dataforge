import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const DEFAULT_LABELS = ['Reliable', 'Misleading', 'False'];

// Runs before every handler in this file: no session userId, no access.
router.use(requireAuth);

// Create a dataset
router.post('/', async (req, res) => {
  const { name, labels = DEFAULT_LABELS } = req.body;

  const labelsValid =
    Array.isArray(labels) &&
    labels.length >= 2 &&
    labels.every((l) => typeof l === 'string' && l.trim() !== '');

  if (typeof name !== 'string' || name.trim() === '' || !labelsValid) {
    return res
      .status(400)
      .json({ error: 'A name and at least 2 non-empty labels are required' });
  }

  const { rows } = await pool.query(
    `insert into datasets (owner_id, name, labels)
     values ($1, $2, $3)
     returning id, name, labels, created_at`,
    [req.session.userId, name.trim(), labels.map((l) => l.trim())]
  );
  res.status(201).json(rows[0]);
});

// List the current user's datasets, with progress counts
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `select d.id, d.name, d.labels, d.created_at,
            count(s.id)::int as sample_count,
            count(a.id)::int as annotated_count
     from datasets d
     left join samples s on s.dataset_id = d.id
     left join annotations a on a.sample_id = s.id and a.user_id = $1
     where d.owner_id = $1
     group by d.id
     order by d.created_at desc`,
    [req.session.userId]
  );
  res.json(rows);
});

// Get one dataset
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }

  const { rows } = await pool.query(
    `select id, name, labels, created_at
     from datasets
     where id = $1 and owner_id = $2`,
    [id, req.session.userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Dataset not found' });
  }
  res.json(rows[0]);
});

// Delete a dataset (its samples and annotations are deleted by the database)
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }

  const { rows } = await pool.query(
    'delete from datasets where id = $1 and owner_id = $2 returning id',
    [id, req.session.userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Dataset not found' });
  }
  res.status(204).end();
});

export default router;