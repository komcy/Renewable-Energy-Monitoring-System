/**
 * Physics-lite performance model shared by telemetry ingestion, the alert
 * engine and (later) the simulator and analytics.
 *
 * "Efficiency" in REMS is the performance ratio: actual output as a % of the
 * output expected for the measured conditions. That is what the SRS
 * "efficiency below 40%" rule refers to.
 */

const STC_IRRADIANCE = 1000; // W/m² at standard test conditions
const STC_TEMPERATURE = 25; // °C
const SOLAR_TEMP_COEFF = -0.004; // -0.4 % output per °C above STC
// Below this share of capacity, expected output is too small for a ratio to mean anything
const MIN_MEANINGFUL_EXPECTED = 0.05;
// Readings further apart than this are treated as a data gap for energy integration
const MAX_INTEGRATION_GAP_HOURS = 1;

const round = (n, dp = 2) => (n == null ? n : Math.round(n * 10 ** dp) / 10 ** dp);

/** Expected power (kW) for the reading's conditions, or null if not derivable. */
const expectedPower = (asset, reading) => {
  const capacity = asset.capacity;

  if (asset.sourceType === 'SolarPanel') {
    if (reading.irradiance == null) return null;
    const derate =
      reading.temperature == null ? 1 : 1 + SOLAR_TEMP_COEFF * (reading.temperature - STC_TEMPERATURE);
    const p = capacity * (reading.irradiance / STC_IRRADIANCE) * Math.max(derate, 0);
    return round(Math.min(Math.max(p, 0), capacity), 3);
  }

  if (asset.sourceType === 'WindTurbine') {
    if (reading.windSpeed == null) return null;
    const { cutInSpeed = 3, ratedWindSpeed = 12, cutOutSpeed = 25 } = asset.windSpecs || {};
    const v = reading.windSpeed;
    if (v < cutInSpeed || v >= cutOutSpeed) return 0;
    if (v >= ratedWindSpeed) return capacity;
    // Cubic power curve between cut-in and rated speed
    const p = (capacity * (v ** 3 - cutInSpeed ** 3)) / (ratedWindSpeed ** 3 - cutInSpeed ** 3);
    return round(p, 3);
  }

  return null;
};

/** True when expected output is large enough for ratio-based checks. */
const isMeaningfulExpected = (asset, expected) =>
  expected != null && expected >= asset.capacity * MIN_MEANINGFUL_EXPECTED;

/** Performance ratio (%) or null when it can't be judged. */
const computeEfficiency = (asset, powerOutput, expected) => {
  if (!isMeaningfulExpected(asset, expected)) return null;
  return round(Math.min(100, Math.max(0, (powerOutput / expected) * 100)));
};

/**
 * Energy (kWh) produced between two readings using the trapezoidal rule.
 * Only positive output counts (battery charging is not generation).
 */
const energyBetween = (prev, curr) => {
  if (!prev) return 0;
  const hours = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 3_600_000;
  if (hours <= 0 || hours > MAX_INTEGRATION_GAP_HOURS) return 0;
  const avgKw = (Math.max(prev.powerOutput, 0) + Math.max(curr.powerOutput, 0)) / 2;
  return avgKw * hours;
};

module.exports = {
  expectedPower,
  isMeaningfulExpected,
  computeEfficiency,
  energyBetween,
  round,
  MAX_INTEGRATION_GAP_HOURS,
};
