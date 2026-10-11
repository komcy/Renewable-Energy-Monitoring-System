/**
 * Production serving: with NODE_ENV=production and client/dist built, Express
 * serves the React app, falls back to index.html for client routes and keeps
 * JSON 404s for /api. (Each test file runs in its own process, so setting
 * NODE_ENV here doesn't affect the other files.) No database needed.
 */
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'rems-test-secret-'.padEnd(64, 'x');

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', '..', 'client', 'dist');
const built = fs.existsSync(path.join(dist, 'index.html'));

describe('production client serving', { skip: built ? false : 'client/dist not built — run `npm run build` first' }, () => {
  let server;
  let base;
  before(async () => {
    const app = require('../app');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves the React app at the root with security headers', async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /<div id="root"><\/div>/);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  it('falls back to index.html for client-side routes', async () => {
    for (const route of ['/dashboard', '/plants/abc123', '/maintenance?view=table']) {
      const r = await fetch(base + route);
      assert.equal(r.status, 200, route);
      assert.match(await r.text(), /<div id="root">/, route);
    }
  });

  it('keeps JSON 404s for unknown API routes', async () => {
    const r = await fetch(`${base}/api/does-not-exist`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).success, false);
  });

  it('caches hashed assets immutably', async () => {
    const html = await (await fetch(`${base}/`)).text();
    const asset = html.match(/\/assets\/[^"]+\.js/)[0];
    const r = await fetch(base + asset);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /immutable/);
  });

  it('allows the UI\'s own origin but rejects foreign ones', async () => {
    const self = await fetch(`${base}/api/health`, { headers: { Origin: base } });
    assert.equal(self.status, 200);
    const foreign = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
  });
});
