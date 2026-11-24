import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { pool } from '../src/db.js';

export { app, pool };

export const PASSWORD = 'password123';

// ".test" is a top-level domain reserved for testing (it can never be a real address).
// Every user the tests create has an email ending in it, which is how cleanup finds them.
const TEST_DOMAIN = 'dataforge.test';

export function uniqueEmail() {
  return `user-${randomUUID()}@${TEST_DOMAIN}`;
}

// Registers a new user and returns an agent that keeps the session cookie.
export async function loggedInAgent() {
  const agent = request.agent(app);
  const email = uniqueEmail();
  const res = await agent.post('/api/auth/register').send({ email, password: PASSWORD });
  if (res.status !== 201) {
    throw new Error(`Test setup failed: register returned ${res.status}`);
  }
  return { agent, email, userId: res.body.id };
}

export async function createDataset(agent, body = { name: 'Test dataset' }) {
  const res = await agent.post('/api/datasets').send(body);
  if (res.status !== 201) {
    throw new Error(`Test setup failed: create dataset returned ${res.status}`);
  }
  return res.body;
}

export function uploadCsv(agent, datasetId, csv) {
  return agent
    .post(`/api/datasets/${datasetId}/samples`)
    .attach('file', Buffer.from(csv), { filename: 'samples.csv', contentType: 'text/csv' });
}

// csvOf('a', 'b') -> a CSV with a "text" header and two rows
export function csvOf(...texts) {
  return 'text\n' + texts.map((t) => `"${t}"`).join('\n');
}

export async function cleanupTestData() {
  // Sessions are not linked to users by a foreign key, so delete them explicitly first.
  await pool.query(
    `delete from session
     where (sess->>'userId')::int in (select id from users where email like $1)`,
    [`%@${TEST_DOMAIN}`]
  );
  // Deleting users cascades to their datasets, samples and annotations.
  await pool.query('delete from users where email like $1', [`%@${TEST_DOMAIN}`]);
}

export async function closeDb() {
  await cleanupTestData();
  await pool.end();
}