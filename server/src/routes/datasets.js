import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const router = Router();
const DEFAULT_LABELS = ['Reliable', 'Misleading', 'False'];
const MAX_SAMPLES = 5000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

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

// Upload a CSV of samples into a dataset
router.post(
  '/:id/samples',
  (req, res, next) => {
    // Run multer by hand so its errors become JSON responses
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large (max 2 MB)' });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid dataset id' });
    }

    const owned = await pool.query(
      'select id from datasets where id = $1 and owner_id = $2',
      [id, req.session.userId]
    );
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Attach a CSV file in the "file" field' });
    }

    let records;
    try {
      records = parse(req.file.buffer, {
        columns: (header) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter: [',', ';'],
      });
    } catch (err) {
      return res.status(400).json({ error: 'Could not parse the CSV file' });
    }

    if (records.length === 0 || !('text' in records[0])) {
      return res
        .status(400)
        .json({ error: 'The CSV needs a header row with a "text" column and at least one row' });
    }
    if (records.length > MAX_SAMPLES) {
      return res.status(400).json({ error: `Too many rows (max ${MAX_SAMPLES})` });
    }

    const texts = records.map((r) => r.text).filter((t) => t !== '');
    if (texts.length === 0) {
      return res.status(400).json({ error: 'No non-empty text values found' });
    }

    const result = await pool.query(
      'insert into samples (dataset_id, text) select $1, unnest($2::text[])',
      [id, texts]
    );
    res.status(201).json({
      inserted: result.rowCount,
      skipped: records.length - texts.length,
    });
  }
);

// List a dataset's samples (paginated), with the current user's label if any
router.get('/:id/samples', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }
  const limit = Math.min(Math.floor(Number(req.query.limit)) || 20, 100);
  const offset = Math.max(Math.floor(Number(req.query.offset)) || 0, 0);

  const totalResult = await pool.query(
    `select count(s.id)::int as total
     from datasets d
     left join samples s on s.dataset_id = d.id
     where d.id = $1 and d.owner_id = $2
     group by d.id`,
    [id, req.session.userId]
  );
  if (totalResult.rows.length === 0) {
    return res.status(404).json({ error: 'Dataset not found' });
  }

  const { rows } = await pool.query(
    `select s.id, s.text, a.label
     from samples s
     left join annotations a on a.sample_id = s.id and a.user_id = $2
     where s.dataset_id = $1
     order by s.id
     limit $3 offset $4`,
    [id, req.session.userId, limit, offset]
  );
  res.json({ total: totalResult.rows[0].total, samples: rows });
});

export default router;