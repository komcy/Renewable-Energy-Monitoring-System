/** Telemetry ingestion: derived values, energy integration and alert creation. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

const near = (actual, expected, tolerance = 0.05, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ≈${expected}, got ${actual}`);

describe('telemetry ingestion and alerts', () => {
  let t;
  let token;
  let pv;
  let battery;
  const t0 = Date.now() - 3 * 3_600_000;
  const at = (minutes) => new Date(t0 + minutes * 60_000).toISOString();

  before(async () => {
    t = await startTestServer();
    ({ token } = await t.createUser('Operator'));
    const plant = (await t.call('POST', '/plants', { token, body: { plantName: 'Telemetry Plant', plantType: 'Hybrid', capacity: 1000 } })).body.data;
    pv = (
      await t.call('POST', '/assets', { token, body: { assetCode: 'TT-PV1', name: 'Array 1', sourceType: 'SolarPanel', plant: plant.id, capacity: 100 } })
    ).body.data;
    battery = (
      await t.call('POST', '/assets', { token, body: { assetCode: 'TT-BAT1', name: 'Battery 1', sourceType: 'BatteryStorage', plant: plant.id, capacity: 500 } })
    ).body.data;
  });
  after(async () => {
    await t.close();
  });

  it('computes expected power, efficiency and running energy for a batch', async () => {
    const r = await t.call('POST', '/telemetry', {
      token,
      body: {
        readings: [
          { asset: pv.id, timestamp: at(0), powerOutput: 70, irradiance: 800, temperature: 45 },
          { asset: pv.id, timestamp: at(15), powerOutput: 0, irradiance: 850, temperature: 45 },
          { assetCode: 'TT-PV1', timestamp: at(30), powerOutput: 60, irradiance: 850, temperature: 90 },
        ],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.inserted, 3);
    const [a, b, c] = r.body.readings;

    // Expected = capacity × irradiance/1000 × (1 − 0.004 × (T − 25))
    near(a.expectedPower, 73.6, 0.01, 'expected power');
    near(a.efficiency, (70 / 73.6) * 100, 0.01, 'efficiency');
    near(b.expectedPower, 78.2, 0.01, 'expected power at 850 W/m²');
    near(c.expectedPower, 62.9, 0.01, 'expected power when hot');

    // Trapezoidal energy: (70 + 0)/2 × 0.25 h, then + (0 + 60)/2 × 0.25 h
    assert.equal(a.cumulativeEnergy, 0);
    near(b.cumulativeEnergy, 8.75, 0.001, 'energy after 15 min');
    near(c.cumulativeEnergy, 16.25, 0.001, 'energy after 30 min');
  });

  it('raises alerts for zero generation in sun and for overheating', async () => {
    const alerts = (await t.call('GET', `/alerts?asset=${pv.id}`, { token })).body.data;
    const byType = Object.fromEntries(alerts.map((x) => [x.alertType, x]));
    assert.equal(byType.ZeroGeneration?.severity, 'Critical');
    assert.equal(byType.OverTemperature?.severity, 'Critical', '90°C is 15°C over the 75°C limit');
    assert.equal(byType.OverTemperature.observedValue, 90);
    assert.equal(byType.OverTemperature.thresholdValue, 75);
  });

  it('updates the open alert instead of duplicating it when a fault repeats', async () => {
    const r = await t.call('POST', '/telemetry', {
      token,
      body: { asset: pv.id, timestamp: at(45), powerOutput: 61, irradiance: 850, temperature: 92 },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.alertsCreated, 0);
    const updated = r.body.alerts.updated.find((x) => x.alertType === 'OverTemperature');
    assert.equal(updated?.occurrenceCount, 2);
    const open = (await t.call('GET', `/alerts?asset=${pv.id}&alertType=OverTemperature`, { token })).body;
    assert.equal(open.total, 1);
  });

  it('marks low-efficiency readings Degraded and raises a LowEfficiency alert', async () => {
    const r = await t.call('POST', '/telemetry', {
      token,
      body: { asset: pv.id, timestamp: at(60), powerOutput: 20, irradiance: 850, temperature: 30 },
    });
    assert.equal(r.status, 201);
    const reading = r.body.readings[0];
    assert.ok(reading.efficiency < 40);
    assert.equal(reading.operatingStatus, 'Degraded');
    assert.ok(r.body.alerts.created.some((x) => x.alertType === 'LowEfficiency'));
  });

  it('flags a battery below its minimum state of charge', async () => {
    const r = await t.call('POST', '/telemetry', {
      token,
      body: { asset: battery.id, timestamp: at(10), powerOutput: -50, stateOfCharge: 8, temperature: 30 },
    });
    assert.equal(r.status, 201);
    const alert = r.body.alerts.created.find((x) => x.alertType === 'LowStateOfCharge');
    assert.equal(alert?.severity, 'Critical', '8% is under half of the 20% minimum');
  });

  it('rejects a batch with any invalid record and stores nothing', async () => {
    const before = (await t.call('GET', `/telemetry?asset=${pv.id}`, { token })).body.total;
    const r = await t.call('POST', '/telemetry', {
      token,
      body: [
        { asset: pv.id, timestamp: at(70), powerOutput: 10 },
        { asset: pv.id, timestamp: at(75), powerOutput: 'abc' },
        { assetCode: 'NOPE-1', powerOutput: 1 },
        { asset: pv.id, timestamp: at(80), powerOutput: 5000 },
      ],
    });
    assert.equal(r.status, 400);
    assert.deepEqual(
      r.body.details.map((d) => d.index),
      [1, 2, 3]
    );
    const after = (await t.call('GET', `/telemetry?asset=${pv.id}`, { token })).body.total;
    assert.equal(after, before);
  });

  it('rejects duplicate readings and telemetry for deactivated assets', async () => {
    const dup = await t.call('POST', '/telemetry', { token, body: { asset: pv.id, timestamp: at(0), powerOutput: 70 } });
    assert.equal(dup.status, 400);
    assert.match(dup.body.details[0].errors[0], /already exists/);

    await t.call('PATCH', `/assets/${battery.id}/status`, { token, body: { status: 'Deactivated' } });
    const inactive = await t.call('POST', '/telemetry', { token, body: { asset: battery.id, powerOutput: 10 } });
    assert.equal(inactive.status, 409);
  });

  it('aggregates generation by hour for charts', async () => {
    const r = await t.call('GET', `/telemetry/aggregate?interval=hour&asset=${pv.id}&from=${at(-60)}&to=${at(120)}`, { token });
    assert.equal(r.status, 200);
    const readings = r.body.data.reduce((s, b) => s + b.readings, 0);
    assert.equal(readings, 5);
  });
});
