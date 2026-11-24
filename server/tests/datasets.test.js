import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, closeDb, loggedInAgent, createDataset, uploadCsv, csvOf } from './helpers.js';

let alice;
let bob;

beforeAll(async () => {
  alice = await loggedInAgent();
  bob = await loggedInAgent();
});

afterAll(closeDb);

describe('authentication guard', () => {
  it('rejects every dataset route without a session', async () => {
    const routes = [
      ['get', '/api/datasets'],
      ['post', '/api/datasets'],
      ['get', '/api/datasets/1'],
      ['get', '/api/datasets/1/samples'],
      ['get', '/api/datasets/1/stats'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method](path);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });
});

describe('creating datasets', () => {
  it('uses the default labels when none are given', async () => {
    const res = await alice.agent.post('/api/datasets').send({ name: 'Defaults' });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(['Reliable', 'Misleading', 'False']);
  });

  it('keeps custom labels and trims whitespace', async () => {
    const res = await alice.agent
      .post('/api/datasets')
      .send({ name: 'Sentiment', labels: [' Positive ', 'Negative'] });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(['Positive', 'Negative']);
  });

  it('rejects an empty name', async () => {
    const res = await alice.agent.post('/api/datasets').send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects fewer than two labels', async () => {
    const res = await alice.agent.post('/api/datasets').send({ name: 'One label', labels: ['A'] });
    expect(res.status).toBe(400);
  });
});

describe('ownership', () => {
  it('lists only the current user\'s datasets', async () => {
    const dataset = await createDataset(alice.agent, { name: 'Alice only' });

    const aliceList = await alice.agent.get('/api/datasets');
    const bobList = await bob.agent.get('/api/datasets');

    expect(aliceList.body.map((d) => d.id)).toContain(dataset.id);
    expect(bobList.body.map((d) => d.id)).not.toContain(dataset.id);
  });

  it('answers 404 when another user asks for a dataset', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await bob.agent.get(`/api/datasets/${dataset.id}`);
    expect(res.status).toBe(404);
  });

  it('does not let another user delete a dataset', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await bob.agent.delete(`/api/datasets/${dataset.id}`);
    expect(res.status).toBe(404);

    const stillThere = await alice.agent.get(`/api/datasets/${dataset.id}`);
    expect(stillThere.status).toBe(200);
  });

  it('rejects a dataset id that is not a number', async () => {
    const res = await alice.agent.get('/api/datasets/abc');
    expect(res.status).toBe(400);
  });

  it('lets the owner delete a dataset', async () => {
    const dataset = await createDataset(alice.agent);

    const del = await alice.agent.delete(`/api/datasets/${dataset.id}`);
    expect(del.status).toBe(204);

    const after = await alice.agent.get(`/api/datasets/${dataset.id}`);
    expect(after.status).toBe(404);
  });
});

describe('CSV upload', () => {
  it('stores the rows of a comma-separated file', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await uploadCsv(alice.agent, dataset.id, csvOf('one', 'two', 'three'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ inserted: 3, skipped: 0 });

    const list = await alice.agent.get('/api/datasets');
    const listed = list.body.find((d) => d.id === dataset.id);
    expect(listed.sample_count).toBe(3);
  });

  it('accepts a semicolon-separated file with a byte order mark', async () => {
    const dataset = await createDataset(alice.agent);
    const csv = '\ufefftext;note\nhello;x\nworld;y';

    const res = await uploadCsv(alice.agent, dataset.id, csv);
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(2);
  });

  it('skips rows with an empty text value and reports how many', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await uploadCsv(alice.agent, dataset.id, 'text\n"a"\n""\n"b"');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ inserted: 2, skipped: 1 });
  });

  it('rejects a file without a "text" column', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await uploadCsv(alice.agent, dataset.id, 'content\n"hello"');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/);
  });

  it('rejects a malformed file', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await uploadCsv(alice.agent, dataset.id, 'text\n"never closed');
    expect(res.status).toBe(400);
  });

  it('rejects a request with no file', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await alice.agent.post(`/api/datasets/${dataset.id}/samples`);
    expect(res.status).toBe(400);
  });

  it('does not let another user upload into your dataset', async () => {
    const dataset = await createDataset(alice.agent);

    const res = await uploadCsv(bob.agent, dataset.id, csvOf('intruder'));
    expect(res.status).toBe(404);
  });
});

describe('listing samples', () => {
  it('paginates and reports the total', async () => {
    const dataset = await createDataset(alice.agent);
    await uploadCsv(alice.agent, dataset.id, csvOf('s1', 's2', 's3', 's4', 's5'));

    const res = await alice.agent.get(`/api/datasets/${dataset.id}/samples?limit=2&offset=2`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.samples.map((s) => s.text)).toEqual(['s3', 's4']);
  });

  it('does not show another user the samples', async () => {
    const dataset = await createDataset(alice.agent);
    await uploadCsv(alice.agent, dataset.id, csvOf('private'));

    const res = await bob.agent.get(`/api/datasets/${dataset.id}/samples`);
    expect(res.status).toBe(404);
  });
});