import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, pool, closeDb, uniqueEmail, PASSWORD } from './helpers.js';

afterAll(closeDb);

// Returns the value of the connect.sid cookie set by a response, or null.
function sessionCookie(res) {
  const cookies = res.headers['set-cookie'] ?? [];
  const raw = cookies.find((c) => c.startsWith('connect.sid='));
  return raw ? raw.split(';')[0].slice('connect.sid='.length) : null;
}

// The cookie value looks like  s%3A<sessionId>.<signature>  ->  returns <sessionId>
function sessionIdOf(cookieValue) {
  return decodeURIComponent(cookieValue).slice(2).split('.')[0];
}

describe('registration', () => {
  it('creates an account and starts a session with a protected cookie', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body).not.toHaveProperty('password_hash');

    const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('connect.sid='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it.each([
    ['an email without @', { email: 'not-an-email', password: PASSWORD }],
    ['a password shorter than 8 characters', { email: 'a@dataforge.test', password: 'short' }],
    ['a missing password', { email: 'b@dataforge.test' }],
  ])('rejects %s', async (_name, body) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  it('stores a bcrypt hash, never the password', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ email, password: PASSWORD });

    const { rows } = await pool.query('select password_hash from users where email = $1', [email]);
    expect(rows[0].password_hash).not.toBe(PASSWORD);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('refuses a duplicate email, ignoring letter case', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ email, password: PASSWORD });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
  });
});

describe('login and session', () => {
  it('logs in with the right password and recognises the user afterwards', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ email, password: PASSWORD });

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.email).toBe(email);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ email, password: PASSWORD });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('answers 401 on /me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('ends the session on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: uniqueEmail(), password: PASSWORD });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('issues a new session ID at login and deletes the old session', async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email, password: PASSWORD });

    const first = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    const second = await agent.post('/api/auth/login').send({ email, password: PASSWORD });

    const firstId = sessionIdOf(sessionCookie(first));
    const secondId = sessionIdOf(sessionCookie(second));
    expect(secondId).not.toBe(firstId);

    const old = await pool.query('select 1 from session where sid = $1', [firstId]);
    const current = await pool.query('select 1 from session where sid = $1', [secondId]);
    expect(old.rows).toHaveLength(0);
    expect(current.rows).toHaveLength(1);
  });
});