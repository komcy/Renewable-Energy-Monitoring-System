/** Role-based access control: what Viewers, Operators and Admins may do. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

describe('role-based access control', () => {
  let t;
  let admin;
  let operator;
  let viewer;
  let plant;
  let asset;

  before(async () => {
    t = await startTestServer();
    admin = await t.createUser('Admin');
    operator = await t.createUser('Operator');
    viewer = await t.createUser('Viewer');

    plant = (await t.call('POST', '/plants', { token: admin.token, body: { plantName: 'RBAC Plant', plantType: 'Solar', capacity: 500 } })).body.data;
    asset = (
      await t.call('POST', '/assets', {
        token: admin.token,
        body: { assetCode: 'RBAC-PV1', name: 'RBAC Panel', sourceType: 'SolarPanel', plant: plant.id, capacity: 100 },
      })
    ).body.data;
  });
  after(async () => {
    await t.close();
  });

  it('requires authentication on every domain route', async () => {
    for (const url of ['/plants', '/assets', '/telemetry', '/alerts', '/maintenance', '/reports', '/analytics/dashboard', '/simulator/status']) {
      assert.equal((await t.call('GET', url)).status, 401, `${url} should require a token`);
    }
  });

  it('lets Viewers read monitoring data', async () => {
    for (const url of ['/plants', `/plants/${plant.id}`, '/assets', '/telemetry', '/alerts', '/maintenance', '/analytics/dashboard', '/simulator/status']) {
      assert.equal((await t.call('GET', url, { token: viewer.token })).status, 200, `Viewer should read ${url}`);
    }
  });

  it('blocks Viewers from every write and control action (403)', async () => {
    const attempts = [
      ['POST', '/plants', { plantName: 'X', plantType: 'Solar', capacity: 1 }],
      ['PUT', `/plants/${plant.id}`, { capacity: 1 }],
      ['POST', '/assets', { assetCode: 'X1', name: 'X', sourceType: 'SolarPanel', plant: plant.id, capacity: 1 }],
      ['PATCH', `/assets/${asset.id}/status`, { status: 'Deactivated' }],
      ['POST', '/telemetry', { asset: asset.id, powerOutput: 1 }],
      ['POST', '/simulator/start', {}],
      ['POST', '/simulator/stop', {}],
      ['POST', '/simulator/anomaly', { assetCode: 'RBAC-PV1', type: 'fault' }],
      ['POST', '/maintenance', { asset: asset.id, title: 'X', scheduledDate: new Date().toISOString() }],
      ['GET', '/users', undefined],
      ['POST', '/users', { name: 'X', email: 'x@test.rems' }],
    ];
    for (const [method, url, body] of attempts) {
      const r = await t.call(method, url, { token: viewer.token, body });
      assert.equal(r.status, 403, `Viewer ${method} ${url} should be forbidden, got ${r.status}`);
    }
  });

  it('lets Operators manage operations but not users', async () => {
    const created = await t.call('POST', '/plants', { token: operator.token, body: { plantName: 'Operator Plant', plantType: 'Wind', capacity: 100 } });
    assert.equal(created.status, 201);
    const wo = await t.call('POST', '/maintenance', {
      token: operator.token,
      body: { asset: asset.id, title: 'Inspect', scheduledDate: new Date(Date.now() + 86_400_000).toISOString() },
    });
    assert.equal(wo.status, 201);
    assert.equal((await t.call('GET', '/users', { token: operator.token })).status, 403);
  });

  it('lets Admins manage users', async () => {
    const r = await t.call('GET', '/users', { token: admin.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.counts.byRole.Admin >= 1);
  });

  it('applies a role change on the very next request', async () => {
    const op = await t.createUser('Operator');
    const before = await t.call('PATCH', `/assets/${asset.id}/status`, { token: op.token, body: { status: 'Active' } });
    assert.equal(before.status, 200);

    const demote = await t.call('PUT', `/users/${op.user.id}`, { token: admin.token, body: { role: 'Viewer' } });
    assert.equal(demote.status, 200);

    const after = await t.call('PATCH', `/assets/${asset.id}/status`, { token: op.token, body: { status: 'Active' } });
    assert.equal(after.status, 403, 'the same token must lose Operator rights immediately');
  });

  it('signs a user out everywhere when sessions are revoked', async () => {
    const v = await t.createUser('Viewer');
    assert.equal((await t.call('GET', '/auth/me', { token: v.token })).status, 200);
    assert.equal((await t.call('POST', `/users/${v.user.id}/revoke-sessions`, { token: admin.token })).status, 200);
    assert.equal((await t.call('GET', '/auth/me', { token: v.token })).status, 401);
  });

  it('refuses to let an Admin demote or deactivate themselves', async () => {
    assert.equal((await t.call('PUT', `/users/${admin.user.id}`, { token: admin.token, body: { role: 'Viewer' } })).status, 400);
    assert.equal((await t.call('PUT', `/users/${admin.user.id}`, { token: admin.token, body: { isActive: false } })).status, 400);
  });
});
