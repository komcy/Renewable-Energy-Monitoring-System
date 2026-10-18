const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreHealth, recommend, rankCauses } = require('../services/healthModel');

const healthy = { efficiency: 92, recentEfficiency: 92, priorEfficiency: 92, faultShare: 0, degradedShare: 0, hotShare: 0, openAlerts: {} };

test('a healthy asset scores near 100 with Low risk and no task', () => {
  const r = scoreHealth(healthy);
  assert.equal(r.healthIndex, 100);
  assert.equal(r.riskLevel, 'Low');
  assert.equal(r.trend, 'Stable');
  assert.equal(recommend({ assetCode: 'PV-1' }, r).schedule, false);
});

test('a degrading, faulty asset becomes High risk and schedules a predictive order', () => {
  const r = scoreHealth({ efficiency: 55, recentEfficiency: 40, priorEfficiency: 62, faultShare: 0.3, degradedShare: 0.2, hotShare: 0.4, openAlerts: { Critical: 1, High: 2 } });
  assert.equal(r.riskLevel, 'High');
  assert.equal(r.trend, 'Declining');
  assert.ok(r.failureProbability > 0.5);
  const rec = recommend({ assetCode: 'PV-1' }, r);
  assert.equal(rec.schedule, true);
  assert.match(rec.title, /^Predictive:/);
  assert.ok(['High', 'Critical'].includes(rec.priority));
});

test('factors are ordered by penalty and health stays within 0-100', () => {
  const r = scoreHealth({ efficiency: 0, recentEfficiency: 0, priorEfficiency: 90, faultShare: 1, degradedShare: 0, hotShare: 1, openAlerts: { Critical: 9 } });
  assert.ok(r.healthIndex >= 0 && r.healthIndex <= 100);
  assert.deepEqual(r.factors.map((f) => f.penalty), [...r.factors.map((f) => f.penalty)].sort((a, b) => b - a));
});

test('missing efficiency data adds no efficiency or trend penalty', () => {
  const r = scoreHealth({ ...healthy, efficiency: null, recentEfficiency: null, priorEfficiency: null });
  assert.equal(r.trend, 'Unknown');
  assert.equal(r.factors.length, 0);
});

test('root-cause ranking prefers weather when sunlight was low', () => {
  const causes = rankCauses('OutputDrop', { avgIrradiance: 80, avgWindSpeed: null, faultShare: 0, hotShare: 0 });
  assert.match(causes[0].cause, /sunlight/i);
});
