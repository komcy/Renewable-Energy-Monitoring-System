/** Pure-logic unit tests (no database): performance model, alert rules, CSV safety. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expectedPower, computeEfficiency, energyBetween } = require('../services/performanceModel');
const { evaluateReading } = require('../services/alertEngine');
const { csvCell, toCsv } = require('../utils/csv');

const solar = {
  name: 'PV',
  sourceType: 'SolarPanel',
  capacity: 100,
  thresholds: { minEfficiency: 40, outputDropPercent: 50, maxTemperature: 75 },
};
const wind = {
  name: 'WT',
  sourceType: 'WindTurbine',
  capacity: 2000,
  windSpecs: { cutInSpeed: 3, ratedWindSpeed: 12, cutOutSpeed: 25 },
  thresholds: { minEfficiency: 40, outputDropPercent: 50, maxWindSpeed: 25 },
};
const types = (asset, reading, prev) => evaluateReading(asset, reading, prev).map((a) => `${a.alertType}:${a.severity}`);

describe('performance model', () => {
  it('derates solar output with temperature', () => {
    assert.equal(expectedPower(solar, { irradiance: 1000, temperature: 25 }), 100);
    assert.equal(expectedPower(solar, { irradiance: 800, temperature: 45 }), 73.6);
    assert.equal(expectedPower(solar, { temperature: 30 }), null, 'no irradiance → unknown');
  });

  it('follows the wind power curve', () => {
    assert.equal(expectedPower(wind, { windSpeed: 2 }), 0, 'below cut-in');
    assert.equal(expectedPower(wind, { windSpeed: 12 }), 2000, 'at rated speed');
    assert.equal(expectedPower(wind, { windSpeed: 26 }), 0, 'above cut-out');
    const mid = expectedPower(wind, { windSpeed: 8 });
    assert.ok(mid > 500 && mid < 600);
  });

  it('only judges efficiency when enough output is expected', () => {
    assert.equal(computeEfficiency(solar, 30, 2), null);
    assert.equal(computeEfficiency(solar, 120, 100), 100, 'capped at 100%');
  });

  it('integrates energy with the trapezoid rule and ignores long gaps', () => {
    const a = { timestamp: '2026-01-01T10:00:00Z', powerOutput: 80 };
    assert.equal(energyBetween(a, { timestamp: '2026-01-01T10:15:00Z', powerOutput: 100 }), 22.5);
    assert.equal(energyBetween(a, { timestamp: '2026-01-01T13:00:00Z', powerOutput: 100 }), 0, 'data gap');
    assert.equal(energyBetween(null, a), 0);
  });
});

describe('alert rules', () => {
  it('stays quiet for healthy output and at night', () => {
    assert.deepEqual(types(solar, { powerOutput: 70, expectedPower: 75, efficiency: 93, temperature: 40 }), []);
    assert.deepEqual(types(solar, { powerOutput: 0, expectedPower: 0 }), []);
  });

  it('distinguishes a fault from a cloud passing', () => {
    const prev = { powerOutput: 72, expectedPower: 76 };
    assert.ok(types(solar, { powerOutput: 20, expectedPower: 75, efficiency: 26.7 }, prev).includes('OutputDrop:Medium'));
    assert.deepEqual(types(solar, { powerOutput: 20, expectedPower: 22, efficiency: 90 }, prev), []);
  });

  it('grades severity by how far a limit is exceeded', () => {
    assert.deepEqual(types(solar, { powerOutput: 0, expectedPower: 75 }), ['ZeroGeneration:Critical']);
    assert.deepEqual(types(solar, { powerOutput: 60, expectedPower: 65, efficiency: 92, temperature: 80 }), ['OverTemperature:High']);
    assert.deepEqual(types(solar, { powerOutput: 60, expectedPower: 65, efficiency: 92, temperature: 88 }), ['OverTemperature:Critical']);
    assert.deepEqual(types(wind, { powerOutput: 0, expectedPower: 0, windSpeed: 28 }), ['HighWindSpeed:Medium']);
  });
});

describe('CSV export safety', () => {
  it('quotes and escapes cells', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(-12.5), '-12.5');
  });

  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvCell('+cmd'), "'+cmd");
    assert.equal(csvCell('-3.5'), '-3.5');
  });

  it('builds a document with a header row', () => {
    const csv = toCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: 1, b: 'x' }]);
    assert.equal(csv, 'A,B\r\n1,x\r\n');
  });
});
