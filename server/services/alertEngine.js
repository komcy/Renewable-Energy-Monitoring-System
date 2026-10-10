/**
 * Rule-based alert engine. Evaluates telemetry readings against each asset's
 * thresholds and creates Alert documents.
 *
 * Deduplication: while an alert of the same type is still open (Active or
 * Acknowledged) for an asset, new detections bump its occurrenceCount /
 * lastOccurredAt (and escalate severity if worse) instead of creating a new alert.
 */
const Alert = require('../models/Alert');
const { SEVERITIES } = require('../models/Alert');
const { isMeaningfulExpected, round } = require('./performanceModel');

const severityRank = (s) => SEVERITIES.indexOf(s);

// Zero output is only a fault when conditions should produce at least this share of capacity
const ZERO_GEN_MIN_EXPECTED = 0.2;
// Output-drop checks ignore readings where previous output was below this share of capacity
const DROP_MIN_PREV_OUTPUT = 0.1;

/**
 * Pure rule evaluation: returns alert candidates for one reading.
 * `prev` is the asset's previous reading (or null).
 */
const evaluateReading = (asset, reading, prev) => {
  const t = asset.thresholds || {};
  const out = [];
  const add = (alertType, severity, message, observedValue, thresholdValue) =>
    out.push({ alertType, severity, message, observedValue, thresholdValue });

  const { powerOutput, expectedPower: expected, efficiency } = reading;
  const capacity = asset.capacity;

  // Reported status from the device
  if (reading.operatingStatus === 'Fault') {
    add('FaultStatus', 'High', `${asset.name} reported a fault status`);
  } else if (reading.operatingStatus === 'Offline') {
    add('AssetOffline', 'Medium', `${asset.name} reported offline`);
  }

  // Generation checks (solar / wind)
  if (expected != null) {
    if (powerOutput <= 0 && expected >= capacity * ZERO_GEN_MIN_EXPECTED) {
      add(
        'ZeroGeneration',
        'Critical',
        `${asset.name} produced no power while ${round(expected)} kW was expected`,
        powerOutput,
        round(expected)
      );
    } else if (efficiency != null && t.minEfficiency != null && efficiency < t.minEfficiency) {
      add(
        'LowEfficiency',
        efficiency < t.minEfficiency / 2 ? 'High' : 'Medium',
        `${asset.name} running at ${efficiency}% of expected output (min ${t.minEfficiency}%)`,
        efficiency,
        t.minEfficiency
      );
    }
  }

  // Sudden output drop not explained by conditions
  if (
    prev &&
    t.outputDropPercent != null &&
    asset.sourceType !== 'BatteryStorage' &&
    prev.powerOutput >= capacity * DROP_MIN_PREV_OUTPUT &&
    powerOutput > 0 // zero output is covered by ZeroGeneration / status rules
  ) {
    const dropPct = ((prev.powerOutput - powerOutput) / prev.powerOutput) * 100;
    // If conditions explain the drop (expected fell by a similar share), don't alert
    let explained = false;
    if (expected != null && prev.expectedPower != null && prev.expectedPower > 0) {
      const expectedDropPct = ((prev.expectedPower - expected) / prev.expectedPower) * 100;
      explained = expectedDropPct >= dropPct - 10;
    }
    if (dropPct >= t.outputDropPercent && !explained) {
      add(
        'OutputDrop',
        dropPct >= 80 ? 'High' : 'Medium',
        `${asset.name} output dropped ${round(dropPct, 1)}% (${round(prev.powerOutput)} → ${round(powerOutput)} kW)`,
        round(dropPct, 1),
        t.outputDropPercent
      );
    }
  }

  // Overheating (panels, inverters, batteries, transformers)
  if (reading.temperature != null && t.maxTemperature != null && reading.temperature > t.maxTemperature) {
    const over = reading.temperature - t.maxTemperature;
    add(
      'OverTemperature',
      over >= 10 ? 'Critical' : 'High',
      `${asset.name} temperature ${reading.temperature}°C exceeds limit ${t.maxTemperature}°C`,
      reading.temperature,
      t.maxTemperature
    );
  }

  // Wind speed above safe operating limit
  if (
    asset.sourceType === 'WindTurbine' &&
    reading.windSpeed != null &&
    t.maxWindSpeed != null &&
    reading.windSpeed > t.maxWindSpeed
  ) {
    add(
      'HighWindSpeed',
      'Medium',
      `Wind speed ${reading.windSpeed} m/s at ${asset.name} exceeds limit ${t.maxWindSpeed} m/s`,
      reading.windSpeed,
      t.maxWindSpeed
    );
  }

  // Battery state of charge
  if (
    asset.sourceType === 'BatteryStorage' &&
    reading.stateOfCharge != null &&
    t.minStateOfCharge != null &&
    reading.stateOfCharge < t.minStateOfCharge
  ) {
    add(
      'LowStateOfCharge',
      reading.stateOfCharge < t.minStateOfCharge / 2 ? 'Critical' : 'High',
      `${asset.name} state of charge ${reading.stateOfCharge}% below minimum ${t.minStateOfCharge}%`,
      reading.stateOfCharge,
      t.minStateOfCharge
    );
  }

  return out;
};

/**
 * Evaluates an asset's newly inserted readings (sorted oldest → newest) and
 * persists alerts. `prevBefore` is the reading preceding the first one.
 * Returns { created: [...alerts], updated: [...alerts] }.
 */
const processAssetReadings = async (asset, readings, prevBefore) => {
  const open = await Alert.find({ asset: asset._id, status: { $in: ['Active', 'Acknowledged'] } });
  const openByType = new Map(open.map((a) => [a.alertType, a]));
  const created = new Map();
  const updated = new Map();

  let prev = prevBefore;
  for (const reading of readings) {
    for (const c of evaluateReading(asset, reading, prev)) {
      const existing = openByType.get(c.alertType);
      if (existing) {
        existing.occurrenceCount += 1;
        existing.lastOccurredAt = reading.timestamp;
        existing.observedValue = c.observedValue;
        if (severityRank(c.severity) > severityRank(existing.severity)) {
          existing.severity = c.severity;
          existing.message = c.message;
        }
        if (!created.has(existing)) updated.set(existing.id, existing);
      } else {
        const alert = new Alert({
          ...c,
          asset: asset._id,
          plant: asset.plant,
          reading: reading._id,
          timestamp: reading.timestamp,
          lastOccurredAt: reading.timestamp,
        });
        openByType.set(c.alertType, alert);
        created.set(alert, alert);
      }
    }
    prev = reading;
  }

  const toCreate = [...created.values()];
  const toUpdate = [...updated.values()];
  await Promise.all([...toCreate, ...toUpdate].map((a) => a.save()));
  return { created: toCreate, updated: toUpdate };
};

module.exports = { evaluateReading, processAssetReadings, severityRank };
