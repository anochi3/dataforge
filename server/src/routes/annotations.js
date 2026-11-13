import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// Returns a positive integer, or null if the value is not one.
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Save (or change) the current user's label for one sample
router.put('/:id/samples/:sampleId/annotation', async (req, res) => {
  const datasetId = parseId(req.params.id);
  const sampleId = parseId(req.params.sampleId);
  const { label } = req.body;

  if (datasetId === null || sampleId === null || typeof label !== 'string') {
    return res.status(400).json({ error: 'Valid ids and a label are required' });
  }

  // The sample must exist, belong to this dataset, and the dataset must belong to this user.
  const found = await pool.query(
    `select d.labels
     from samples s
     join datasets d on d.id = s.dataset_id
     where s.id = $1 and d.id = $2 and d.owner_id = $3`,
    [sampleId, datasetId, req.session.userId]
  );
  if (found.rows.length === 0) {
    return res.status(404).json({ error: 'Sample not found' });
  }

  const allowedLabels = found.rows[0].labels;
  if (!allowedLabels.includes(label)) {
    return res
      .status(400)
      .json({ error: `Label must be one of: ${allowedLabels.join(', ')}` });
  }

  const { rows } = await pool.query(
    `insert into annotations (sample_id, user_id, label)
     values ($1, $2, $3)
     on conflict (sample_id, user_id)
     do update set label = excluded.label
     returning sample_id, label`,
    [sampleId, req.session.userId, label]
  );
  res.json(rows[0]);
});

// The first sample in the dataset that the current user has not labelled yet
router.get('/:id/samples/next', async (req, res) => {
  const datasetId = parseId(req.params.id);
  if (datasetId === null) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }

  const owned = await pool.query(
    'select id from datasets where id = $1 and owner_id = $2',
    [datasetId, req.session.userId]
  );
  if (owned.rows.length === 0) {
    return res.status(404).json({ error: 'Dataset not found' });
  }

  const { rows } = await pool.query(
    `select s.id, s.text
     from samples s
     where s.dataset_id = $1
       and not exists (
         select 1 from annotations a
         where a.sample_id = s.id and a.user_id = $2
       )
     order by s.id
     limit 1`,
    [datasetId, req.session.userId]
  );
  res.json({ sample: rows[0] ?? null });
});

// Progress and label distribution for the current user
router.get('/:id/stats', async (req, res) => {
  const datasetId = parseId(req.params.id);
  if (datasetId === null) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }

  const dataset = await pool.query(
    'select labels from datasets where id = $1 and owner_id = $2',
    [datasetId, req.session.userId]
  );
  if (dataset.rows.length === 0) {
    return res.status(404).json({ error: 'Dataset not found' });
  }

  const totals = await pool.query(
    `select count(s.id)::int as total, count(a.id)::int as annotated
     from samples s
     left join annotations a on a.sample_id = s.id and a.user_id = $2
     where s.dataset_id = $1`,
    [datasetId, req.session.userId]
  );

  const distribution = await pool.query(
    `select a.label, count(*)::int as count
     from annotations a
     join samples s on s.id = a.sample_id
     where s.dataset_id = $1 and a.user_id = $2
     group by a.label`,
    [datasetId, req.session.userId]
  );

  // Start every label at 0 so labels nobody used yet still appear in the result
  const labelCounts = Object.fromEntries(
    dataset.rows[0].labels.map((label) => [label, 0])
  );
  for (const row of distribution.rows) {
    labelCounts[row.label] = row.count;
  }

  const { total, annotated } = totals.rows[0];
  res.json({ total, annotated, remaining: total - annotated, labelCounts });
});

export default router;