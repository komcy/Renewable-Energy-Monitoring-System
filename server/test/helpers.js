/**
 * Integration test harness: runs the real Express app on a random port
 * against an isolated MongoDB database.
 *
 * The database is TEST_MONGO_URI if set, otherwise MONGO_URI with "_test"
 * appended to the database name (rems → rems_test). It is wiped at the start
 * of each test file, so it must never be a database you care about; the
 * harness refuses any name that doesn't end in "_test".
 */
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// A fixed secret for tests (dotenv below won't override it)
process.env.JWT_SECRET = 'rems-test-secret-'.padEnd(64, 'x');
require('dotenv').config({ quiet: true, path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

function testDatabaseUri() {
  const raw = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
  if (!raw) throw new Error('Set MONGO_URI (or TEST_MONGO_URI) in server/.env to run the integration tests');
  const url = new URL(raw);
  if (!process.env.TEST_MONGO_URI) url.pathname = `/${url.pathname.slice(1) || 'rems'}_test`;
  const db = url.pathname.slice(1);
  if (!db.endsWith('_test')) throw new Error(`Refusing to run tests against database "${db}": its name must end in "_test"`);
  return { uri: url.toString(), db };
}

/**
 * Connects to the test database (wiping it), starts the app and returns helpers.
 * Call `close()` in an after() hook.
 */
async function startTestServer() {
  const { uri, db } = testDatabaseUri();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.name !== db) throw new Error('Connected to an unexpected database');
  await mongoose.connection.dropDatabase();

  // Loading the app registers every model; then build their unique indexes
  // (emails, asset codes, ...) before the tests rely on them
  const app = require('../app');
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  /** fetch wrapper → { status, body, headers } (body parsed as JSON when possible) */
  const call = async (method, url, { token, body, headers = {} } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: parsed, headers: res.headers };
  };

  let counter = 0;
  /** Creates a user with the given role directly in the DB and returns { user, token }. */
  const createUser = async (role = 'Viewer', overrides = {}) => {
    const User = require('../models/User');
    counter += 1;
    const email = `${role.toLowerCase()}${counter}@test.rems`;
    const password = 'Test-password-123';
    const user = await User.create({ name: `${role} ${counter}`, email, password, role, ...overrides });
    const login = await call('POST', '/auth/login', { body: { email, password } });
    if (login.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(login.body)}`);
    return { user, token: login.body.token, email, password };
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };

  return { base, call, createUser, close };
}

module.exports = { startTestServer, testDatabaseUri };
