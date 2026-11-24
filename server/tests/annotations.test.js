import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, closeDb, loggedInAgent, createDataset, uploadCsv, csvOf } from './helpers.js';

let alice;
let bob;

beforeAll(async () => {
  alice = await loggedInAgent();
  bob = await loggedInAgent();
});

afterAll(closeDb);

// Creates a dataset owned by `agent` with one sample per text, and returns the samples with their ids.
async function datasetWithSamples(agent, ...texts) {
  const dataset = await createDataset(agent);
  const upload = await uploadCsv(agent, dataset.id, csvOf(...texts));
  expect(upload.status).toBe(201);
  const list = await agent.get(`/api/datasets/${dataset.id}/samples`);
  return { dataset, samples: list.body.samples };
}

function label(agent, datasetId, sampleId, value) {
  return agent
    .put(`/api/datasets/${datasetId}/samples/${sampleId}/annotation`)
    .send({ label: value });
}

async function annotationRows(sampleId) {
  const { rows } = await pool.query('select label from annotations where sample_id = $1', [sampleId]);
  return rows;
}

describe('next sample', () => {
  it('returns the first unlabelled sample and moves on after labelling', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'first', 'second', 'third');

    const before = await alice.agent.get(`/api/datasets/${dataset.id}/samples/next`);
    expect(before.body.sample.text).toBe('first');

    expect((await label(alice.agent, dataset.id, samples[0].id, 'Reliable')).status).toBe(200);

    const after = await alice.agent.get(`/api/datasets/${dataset.id}/samples/next`);
    expect(after.body.sample.text).toBe('second');
  });

  it('returns null once every sample is labelled', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'only one');
    await label(alice.agent, dataset.id, samples[0].id, 'False');

    const res = await alice.agent.get(`/api/datasets/${dataset.id}/samples/next`);
    expect(res.status).toBe(200);
    expect(res.body.sample).toBeNull();
  });

  it('answers 404 for another user\'s dataset', async () => {
    const { dataset } = await datasetWithSamples(alice.agent, 'private');

    const res = await bob.agent.get(`/api/datasets/${dataset.id}/samples/next`);
    expect(res.status).toBe(404);
  });
});

describe('saving a label', () => {
  it('rejects a label that is not one of the dataset\'s labels', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'text');

    const res = await label(alice.agent, dataset.id, samples[0].id, 'Banana');
    expect(res.status).toBe(400);
    expect(await annotationRows(samples[0].id)).toHaveLength(0);
  });

  it('updates the existing annotation instead of adding a second one', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'text');

    await label(alice.agent, dataset.id, samples[0].id, 'Reliable');
    const second = await label(alice.agent, dataset.id, samples[0].id, 'False');

    expect(second.status).toBe(200);
    const rows = await annotationRows(samples[0].id);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('False');
  });

  it('does not let another user label your samples', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'text');

    const res = await label(bob.agent, dataset.id, samples[0].id, 'Reliable');
    expect(res.status).toBe(404);
    expect(await annotationRows(samples[0].id)).toHaveLength(0);
  });

  it('requires the sample to belong to the dataset in the URL', async () => {
    const one = await datasetWithSamples(alice.agent, 'in dataset one');
    const two = await datasetWithSamples(alice.agent, 'in dataset two');

    // Both datasets are Alice's, but this sample is not part of dataset one.
    const res = await label(alice.agent, one.dataset.id, two.samples[0].id, 'Reliable');
    expect(res.status).toBe(404);
    expect(await annotationRows(two.samples[0].id)).toHaveLength(0);
  });

  it('rejects ids that are not numbers', async () => {
    const res = await alice.agent
      .put('/api/datasets/abc/samples/1/annotation')
      .send({ label: 'Reliable' });
    expect(res.status).toBe(400);
  });
});

describe('stats', () => {
  it('reports progress and a label distribution that includes unused labels', async () => {
    const { dataset, samples } = await datasetWithSamples(alice.agent, 'a', 'b', 'c');
    await label(alice.agent, dataset.id, samples[0].id, 'Reliable');
    await label(alice.agent, dataset.id, samples[1].id, 'Misleading');

    const res = await alice.agent.get(`/api/datasets/${dataset.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 3,
      annotated: 2,
      remaining: 1,
      labelCounts: { Reliable: 1, Misleading: 1, False: 0 },
    });
  });

  it('answers 404 for another user\'s dataset', async () => {
    const { dataset } = await datasetWithSamples(alice.agent, 'private');

    const res = await bob.agent.get(`/api/datasets/${dataset.id}/stats`);
    expect(res.status).toBe(404);
  });
});