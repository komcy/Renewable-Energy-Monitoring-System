/** Auth flow: registration, login, token issuance and validation, password change. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer } = require('./helpers');

describe('auth', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(async () => {
    await t.close();
  });

  it('reports health with the database connected', async () => {
    const r = await t.call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.database, 'connected');
  });

  it('registers new users as Viewer even when another role is requested', async () => {
    const r = await t.call('POST', '/auth/register', {
      body: { name: 'New Person', email: 'new.person@test.rems', password: 'password123', role: 'Admin' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'Viewer');
    assert.equal(r.body.user.password, undefined, 'password hash must never be returned');
    assert.equal(r.body.user.tokenVersion, undefined);
    assert.ok(r.body.token);
  });

  it('rejects duplicate emails and short passwords', async () => {
    const dup = await t.call('POST', '/auth/register', { body: { name: 'Dup', email: 'NEW.person@test.rems', password: 'password123' } });
    assert.equal(dup.status, 409);
    const short = await t.call('POST', '/auth/register', { body: { name: 'Short', email: 'short@test.rems', password: '123' } });
    assert.equal(short.status, 400);
    assert.equal(short.body.details[0].field, 'password');
  });

  it('issues a signed JWT with id, role and token version on login', async () => {
    const bad = await t.call('POST', '/auth/login', { body: { email: 'new.person@test.rems', password: 'wrong-password' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, 'Invalid email or password');

    const ok = await t.call('POST', '/auth/login', { body: { email: 'new.person@test.rems', password: 'password123' } });
    assert.equal(ok.status, 200);
    const payload = jwt.verify(ok.body.token, process.env.JWT_SECRET);
    assert.equal(payload.id, ok.body.user.id);
    assert.equal(payload.role, 'Viewer');
    assert.equal(payload.tv, 0);
    assert.ok(payload.exp > payload.iat);
    assert.ok(ok.body.user.lastLogin);
  });

  it('accepts valid tokens on /me and rejects missing, malformed and tampered ones', async () => {
    const { token, email } = await t.createUser('Operator');
    const me = await t.call('GET', '/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);

    assert.equal((await t.call('GET', '/auth/me')).status, 401);
    assert.equal((await t.call('GET', '/auth/me', { token: 'not.a.token' })).status, 401);

    // Same payload signed with a different secret
    const forged = jwt.sign(jwt.decode(token), 'some-other-secret');
    assert.equal((await t.call('GET', '/auth/me', { token: forged })).status, 401);
  });

  it('blocks deactivated accounts immediately', async () => {
    const { user, token, email, password } = await t.createUser('Viewer');
    user.isActive = false;
    await user.save();
    assert.equal((await t.call('GET', '/auth/me', { token })).status, 403);
    assert.equal((await t.call('POST', '/auth/login', { body: { email, password } })).status, 403);
  });

  it('rotates the token on password change and invalidates the old one', async () => {
    const { token, email, password } = await t.createUser('Viewer');
    const wrong = await t.call('POST', '/auth/change-password', { token, body: { currentPassword: 'nope', newPassword: 'Another-pass-456' } });
    assert.equal(wrong.status, 400);

    const changed = await t.call('POST', '/auth/change-password', { token, body: { currentPassword: password, newPassword: 'Another-pass-456' } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.body.token, token);

    assert.equal((await t.call('GET', '/auth/me', { token })).status, 401, 'old token must stop working');
    assert.equal((await t.call('GET', '/auth/me', { token: changed.body.token })).status, 200);
    assert.equal((await t.call('POST', '/auth/login', { body: { email, password: 'Another-pass-456' } })).status, 200);
  });

  it('rejects MongoDB operator injection in request bodies', async () => {
    const r = await t.call('POST', '/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /Disallowed key/);
  });

  it('returns JSON 404s for unknown API routes', async () => {
    const r = await t.call('GET', '/does-not-exist');
    assert.equal(r.status, 404);
    assert.equal(r.body.success, false);
  });
});
