/**
 * Background telemetry simulator.
 *
 * Generates realistic readings for active assets on a timer and pushes them
 * through the normal ingestion pipeline (enrichment + alert engine), so the
 * rest of the system can't tell simulated data from real data.
 *
 * Environment model (per plant, shared by its assets):
 *   - Solar: clear-sky irradiance curve over the (simulated) day, scaled by a
 *     drifting cloud factor; panel temperature rises with irradiance.
 *   - Wind: mean-reverting random walk around ~8 m/s with gusts.
 *   - Battery: charges during solar hours, discharges in the evening.
 *   - Inverter / transformer: load follows plant generation.
 *
 * `timeScale` speeds up the simulated clock that drives these curves (e.g. 60
 * → one real minute is one simulated hour) while readings keep real
 * timestamps. State is in memory only and is lost on restart.
 */
const Asset = require('../models/Asset');
const ApiError = require('../utils/ApiError');
const { isValidId } = require('../utils/validators');
const { expectedPower, round } = require('./performanceModel');
const { ingestReadings } = require('./telemetryIngestion');

const DEFAULTS = {
  intervalSeconds: 10,
  timeScale: 1,
  durationMinutes: 60,
  anomalyRate: 0,
  timezone: process.env.SIM_TIMEZONE || 'Asia/Kolkata',
};
const MAX_CONSECUTIVE_ERRORS = 5;
const RECENT_ALERTS = 10;

// Which anomaly types apply to which asset types
const ANOMALIES = {
  thermalSpike: ['SolarPanel', 'WindTurbine', 'Inverter', 'BatteryStorage', 'Transformer'],
  efficiencyLoss: ['SolarPanel', 'WindTurbine'],
  zeroOutput: ['SolarPanel', 'WindTurbine'],
  highWind: ['WindTurbine'],
  deepDischarge: ['BatteryStorage'],
  fault: ['SolarPanel', 'WindTurbine', 'Inverter', 'BatteryStorage', 'Transformer'],
  offline: ['SolarPanel', 'WindTurbine', 'Inverter', 'BatteryStorage', 'Transformer'],
};
const THERMAL_SPIKE = { SolarPanel: 35, WindTurbine: 50, Inverter: 25, BatteryStorage: 25, Transformer: 35 };

// ---------------------------------------------------------------- helpers

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const gaussian = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

const formatters = new Map();
/** Fractional hour of day (0–24) of `date` in `timezone`. */
const hourOfDay = (date, timezone) => {
  if (!formatters.has(timezone)) {
    formatters.set(
      timezone,
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    );
  }
  const parts = Object.fromEntries(formatters.get(timezone).formatToParts(date).map((p) => [p.type, p.value]));
  return Number(parts.hour) + Number(parts.minute) / 60 + Number(parts.second) / 3600;
};

/** Clear-sky irradiance (W/m²) for an hour of day: sunrise 06:00, sunset 18:00. */
const clearSkyIrradiance = (hour) => {
  if (hour <= 6 || hour >= 18) return 0;
  return 1000 * Math.sin((Math.PI * (hour - 6)) / 12) ** 1.2;
};

/** Ambient temperature (°C), coolest ~03:00, warmest ~15:00. */
const ambientTemperature = (hour) => 26 + 7 * Math.sin((Math.PI * (hour - 9)) / 12);

// ---------------------------------------------------------------- state

let state = null; // null when never started
let timer = null;
let currentTick = null;

const freshState = (config, user) => {
  const now = Date.now();
  // Shift the simulated clock so it starts at `startHour` (local) today if requested
  let simOrigin = now;
  if (config.startHour != null) {
    simOrigin = now + (config.startHour - hourOfDay(new Date(now), config.timezone)) * 3_600_000;
  }
  return {
    running: true,
    config,
    startedBy: user ? { id: user.id, name: user.name } : null,
    startedAt: new Date(now),
    stoppedAt: null,
    stopReason: null,
    realOrigin: now,
    simOrigin,
    autoStopAt: config.durationMinutes ? new Date(now + config.durationMinutes * 60_000) : null,
    nextTickAt: null,
    ticks: 0,
    readingsGenerated: 0,
    readingsRejected: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    consecutiveErrors: 0,
    lastTick: null,
    lastError: null,
    lastSimTime: simOrigin,
    plants: new Map(), // plantId → { cloud, windSpeed }
    assets: new Map(), // assetId → { soc, perf }
    anomalies: new Map(), // assetId → { type, remaining, assetCode }
    recentAlerts: [],
  };
};

const simNow = (s, realNow = Date.now()) => s.simOrigin + (realNow - s.realOrigin) * s.config.timeScale;

// ---------------------------------------------------------------- models

const plantEnv = (s, plantId, dtHours) => {
  let env = s.plants.get(plantId);
  if (!env) {
    env = { cloud: 0.85 + Math.random() * 0.15, windSpeed: 6 + Math.random() * 4 };
    s.plants.set(plantId, env);
  }
  // Clouds drift around 0.85 (1 = clear sky) with occasional passing clouds
  env.cloud += 0.8 * (0.85 - env.cloud) * dtHours + 0.25 * Math.sqrt(dtHours) * gaussian();
  if (Math.random() < 0.02) env.cloud -= 0.3 * Math.random();
  env.cloud = clamp(env.cloud, 0.25, 1);
  // Wind: Ornstein–Uhlenbeck process around 8 m/s
  env.windSpeed += 0.5 * (8 - env.windSpeed) * dtHours + 3 * Math.sqrt(dtHours) * gaussian();
  env.windSpeed = clamp(env.windSpeed, 0, 24);
  return env;
};

const assetState = (s, asset) => {
  let st = s.assets.get(asset.id);
  if (!st) {
    st = {
      soc: asset.batterySpecs?.stateOfCharge ?? 50 + Math.random() * 30,
      perf: 0.94 + Math.random() * 0.04, // healthy share of expected output
    };
    s.assets.set(asset.id, st);
  }
  st.perf = clamp(st.perf + 0.002 * gaussian(), 0.9, 0.99);
  return st;
};

/** Builds one healthy reading for an asset, before anomalies. */
const generateReading = (s, asset, env, hour, dtHours) => {
  const st = assetState(s, asset);
  const ambient = ambientTemperature(hour) + gaussian() * 0.5;
  const irradiance = Math.max(0, clearSkyIrradiance(hour) * env.cloud + gaussian() * 5);
  const genShare = (clearSkyIrradiance(hour) / 1000) * env.cloud; // 0..1 plant generation proxy
  const cap = asset.capacity;
  const r = { asset: asset.id };

  switch (asset.sourceType) {
    case 'SolarPanel': {
      r.irradiance = round(irradiance, 1);
      r.temperature = round(ambient + (irradiance / 800) * 22, 1);
      const expected = expectedPower(asset, r) || 0;
      r.powerOutput = round(expected * st.perf, 3);
      break;
    }
    case 'WindTurbine': {
      r.windSpeed = round(clamp(env.windSpeed + gaussian() * 0.6, 0, 40), 2);
      const expected = expectedPower(asset, r) || 0;
      r.powerOutput = round(Math.min(cap, expected * st.perf), 3);
      const cutIn = asset.windSpecs?.cutInSpeed ?? 3;
      r.rotorSpeed = r.windSpeed < cutIn ? 0 : round(Math.min(16, 4 + r.windSpeed), 2);
      r.temperature = round(ambient + 8 + (r.powerOutput / cap) * 15, 1); // nacelle
      break;
    }
    case 'Inverter': {
      const load = clamp(genShare * st.perf, 0, 1);
      r.powerOutput = round(cap * load, 3);
      r.efficiency = load > 0.02 ? round(96 + Math.random() * 2, 2) : undefined;
      r.temperature = round(ambient + 5 + 25 * load, 1);
      break;
    }
    case 'BatteryStorage': {
      const energyCap = asset.batterySpecs?.energyCapacity || cap * 2; // kWh
      let power = 0;
      if (hour >= 9 && hour < 16 && st.soc < 95) power = -0.5 * cap; // charge from solar
      else if (hour >= 18 && hour < 23 && st.soc > 25) power = 0.6 * cap; // evening discharge
      power += gaussian() * cap * 0.01;
      st.soc = clamp(st.soc - ((power * dtHours) / energyCap) * 100, 0, 100);
      r.powerOutput = round(power, 3);
      r.stateOfCharge = round(st.soc, 2);
      r.temperature = round(ambient - 2 + Math.abs(power / cap) * 8, 1);
      break;
    }
    case 'Transformer': {
      const load = clamp(0.2 + 0.7 * genShare, 0, 1);
      r.powerOutput = round(cap * load * (0.97 + Math.random() * 0.02), 3);
      r.temperature = round(ambient + 15 + 40 * load, 1);
      break;
    }
    default:
      return null;
  }
  return r;
};

/** Applies an active anomaly to a reading (mutates it). */
const applyAnomaly = (s, asset, r, type) => {
  const st = s.assets.get(asset.id);
  switch (type) {
    case 'thermalSpike': {
      // Always lands above the asset's own limit, even on a cool night
      const limit = asset.thresholds?.maxTemperature ?? 75;
      const spiked = (r.temperature ?? ambientTemperature(12)) + THERMAL_SPIKE[asset.sourceType];
      r.temperature = round(Math.max(spiked, limit + 3 + Math.random() * 10), 1);
      break;
    }
    case 'efficiencyLoss':
      r.powerOutput = round(r.powerOutput * 0.25, 3);
      break;
    case 'zeroOutput':
      r.powerOutput = 0;
      if (r.efficiency !== undefined) r.efficiency = undefined;
      break;
    case 'highWind':
      r.windSpeed = round((asset.thresholds?.maxWindSpeed ?? 25) + 3 + Math.random() * 2, 2);
      r.powerOutput = 0; // turbine cuts out
      r.rotorSpeed = 0;
      break;
    case 'deepDischarge':
      st.soc = Math.min(st.soc, 6 + Math.random() * 3);
      r.stateOfCharge = round(st.soc, 2);
      r.powerOutput = round(0.3 * asset.capacity, 3);
      break;
    case 'fault':
      r.operatingStatus = 'Fault';
      r.powerOutput = 0;
      break;
    case 'offline':
      r.operatingStatus = 'Offline';
      r.powerOutput = 0;
      break;
    default:
      break;
  }
};

// ---------------------------------------------------------------- loop

const assetFilter = (config) => {
  const filter = { status: 'Active' };
  if (config.plant) filter.plant = config.plant;
  if (config.assetCodes?.length) filter.assetCode = { $in: config.assetCodes };
  return filter;
};

const tick = async () => {
  const s = state;
  const started = Date.now();
  const sim = simNow(s, started);
  const dtHours = Math.max(sim - s.lastSimTime, 0) / 3_600_000 || (s.config.intervalSeconds * s.config.timeScale) / 3600;
  s.lastSimTime = sim;
  const hour = hourOfDay(new Date(sim), s.config.timezone);

  const assets = await Asset.find(assetFilter(s.config));
  const records = [];
  const appliedAnomalies = [];
  for (const asset of assets) {
    const env = plantEnv(s, String(asset.plant), dtHours);
    const r = generateReading(s, asset, env, hour, dtHours);
    if (!r) continue;

    // Random anomalies (if enabled)
    if (s.config.anomalyRate > 0 && !s.anomalies.has(asset.id) && Math.random() < s.config.anomalyRate) {
      const types = Object.keys(ANOMALIES).filter((t) => ANOMALIES[t].includes(asset.sourceType) && t !== 'offline');
      const type = types[Math.floor(Math.random() * types.length)];
      s.anomalies.set(asset.id, { type, remaining: 2, assetCode: asset.assetCode, random: true });
    }
    const anomaly = s.anomalies.get(asset.id);
    if (anomaly) {
      applyAnomaly(s, asset, r, anomaly.type);
      appliedAnomalies.push({ assetCode: asset.assetCode, type: anomaly.type });
      anomaly.remaining -= 1;
      if (anomaly.remaining <= 0) s.anomalies.delete(asset.id);
    }
    r.timestamp = new Date(started).toISOString();
    records.push(r);
  }

  let inserted = 0;
  let created = [];
  let updated = [];
  let rejected = [];
  if (records.length) {
    const result = await ingestReadings(records, { source: 'simulator', partial: true });
    ({ inserted, rejected } = result);
    ({ created, updated } = result.alerts);
  }

  const codeById = new Map(assets.map((a) => [a.id, a.assetCode]));
  for (const a of created) {
    s.recentAlerts.unshift({
      at: a.timestamp,
      assetCode: codeById.get(String(a.asset)),
      alertType: a.alertType,
      severity: a.severity,
      message: a.message,
    });
  }
  s.recentAlerts.length = Math.min(s.recentAlerts.length, RECENT_ALERTS);

  s.ticks += 1;
  s.readingsGenerated += inserted;
  s.readingsRejected += rejected.length;
  s.alertsCreated += created.length;
  s.alertsUpdated += updated.length;
  s.consecutiveErrors = 0;
  s.lastTick = {
    at: new Date(started),
    durationMs: Date.now() - started,
    simulatedLocalTime: `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`,
    assets: assets.length,
    inserted,
    rejected: rejected.slice(0, 5).map((x) => ({ assetCode: codeById.get(records[x.index]?.asset), errors: x.errors })),
    alertsCreated: created.length,
    alertsUpdated: updated.length,
    anomalies: appliedAnomalies,
  };
  if (!assets.length) s.lastError = 'No active assets match the simulator filter';
};

const scheduleNext = () => {
  const s = state;
  if (!s?.running) return;
  if (s.autoStopAt && Date.now() >= s.autoStopAt.getTime()) {
    stopNow('duration elapsed');
    return;
  }
  const delay = s.config.intervalSeconds * 1000;
  s.nextTickAt = new Date(Date.now() + delay);
  timer = setTimeout(runTick, delay);
};

const runTick = () => {
  timer = null;
  const s = state;
  if (!s?.running) return;
  currentTick = tick()
    .catch((err) => {
      s.consecutiveErrors += 1;
      s.lastError = `${new Date().toISOString()}: ${err.message}`;
      console.error('[simulator] tick failed:', err.message);
      if (s.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) stopNow(`stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
    })
    .finally(() => {
      currentTick = null;
      scheduleNext();
    });
};

const stopNow = (reason) => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (state?.running) {
    state.running = false;
    state.stoppedAt = new Date();
    state.stopReason = reason;
    state.nextTickAt = null;
    console.log(`[simulator] stopped (${reason})`);
  }
};

// ---------------------------------------------------------------- public API

const numberIn = (body, key, min, max, fallback) => {
  const v = body[key];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, `${key} must be a number between ${min} and ${max}`);
  return n;
};

/** Validates and normalises a start request body. */
const parseConfig = (body = {}) => {
  const config = {
    intervalSeconds: numberIn(body, 'intervalSeconds', 1, 3600, DEFAULTS.intervalSeconds),
    timeScale: numberIn(body, 'timeScale', 1, 1440, DEFAULTS.timeScale),
    durationMinutes: numberIn(body, 'durationMinutes', 0, 1440, DEFAULTS.durationMinutes),
    anomalyRate: numberIn(body, 'anomalyRate', 0, 0.5, DEFAULTS.anomalyRate),
    startHour: numberIn(body, 'startHour', 0, 23.99, undefined),
    timezone: body.timezone === undefined ? DEFAULTS.timezone : String(body.timezone),
  };
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.timezone });
  } catch {
    throw new ApiError(400, `Unknown timezone "${config.timezone}"`);
  }
  if (body.plant !== undefined) {
    if (!isValidId(String(body.plant))) throw new ApiError(400, 'plant must be a valid id');
    config.plant = String(body.plant);
  }
  if (body.assetCodes !== undefined) {
    if (!Array.isArray(body.assetCodes) || body.assetCodes.length > 500 || body.assetCodes.some((c) => typeof c !== 'string')) {
      throw new ApiError(400, 'assetCodes must be an array of asset code strings (max 500)');
    }
    config.assetCodes = body.assetCodes.map((c) => c.trim().toUpperCase());
  }
  return config;
};

/** Starts the simulator; runs the first tick immediately. */
const start = async (body, user) => {
  if (state?.running) throw new ApiError(409, 'Simulator is already running. Stop it first to change settings.');
  const config = parseConfig(body);
  const count = await Asset.countDocuments(assetFilter(config));
  if (!count) throw new ApiError(400, 'No active assets match these settings; nothing to simulate');

  state = freshState(config, user);
  console.log(`[simulator] started: ${count} asset(s), every ${config.intervalSeconds}s, timeScale ${config.timeScale}x`);
  runTick();
  return getStatus();
};

/** Stops the simulator and waits for an in-flight tick to finish. */
const stop = async (reason = 'stopped by user') => {
  const wasRunning = Boolean(state?.running);
  stopNow(reason);
  if (currentTick) await currentTick;
  return { wasRunning, status: getStatus() };
};

/** Queues an anomaly for an asset for the next `ticks` readings. */
const injectAnomaly = async (body = {}) => {
  if (!state?.running) throw new ApiError(409, 'Simulator is not running');
  const type = Object.keys(ANOMALIES).find((t) => t.toLowerCase() === String(body.type ?? '').toLowerCase());
  if (!type) throw new ApiError(400, `type must be one of: ${Object.keys(ANOMALIES).join(', ')}`);
  const ticks = numberIn(body, 'ticks', 1, 100, 3);

  let asset;
  if (body.asset !== undefined) {
    if (!isValidId(String(body.asset))) throw new ApiError(400, 'asset must be a valid id');
    asset = await Asset.findById(String(body.asset));
  } else if (body.assetCode !== undefined) {
    asset = await Asset.findOne({ assetCode: String(body.assetCode).trim().toUpperCase() });
  } else {
    throw new ApiError(400, 'asset (id) or assetCode is required');
  }
  if (!asset) throw new ApiError(404, 'Asset not found');
  if (!ANOMALIES[type].includes(asset.sourceType)) {
    throw new ApiError(400, `${type} does not apply to ${asset.sourceType}. Applicable to: ${ANOMALIES[type].join(', ')}`);
  }
  const simulated = await Asset.exists({ _id: asset._id, ...assetFilter(state.config) });
  if (!simulated) throw new ApiError(400, `${asset.assetCode} is not part of the running simulation (inactive or filtered out)`);

  state.anomalies.set(asset.id, { type, remaining: Math.round(ticks), assetCode: asset.assetCode });

  let note;
  const hour = hourOfDay(new Date(simNow(state)), state.config.timezone);
  if (asset.sourceType === 'SolarPanel' && ['zeroOutput', 'efficiencyLoss'].includes(type) && clearSkyIrradiance(hour) < 300) {
    note = 'It is night or low sun in simulated time, so generation alerts may not trigger. Use thermalSpike/fault, or restart with startHour/timeScale.';
  }
  return { assetCode: asset.assetCode, type, ticks: Math.round(ticks), ...(note && { note }) };
};

const getStatus = () => {
  if (!state) return { running: false, everStarted: false, defaults: DEFAULTS, anomalyTypes: ANOMALIES };
  const s = state;
  const sim = new Date(s.running ? simNow(s) : s.lastSimTime);
  return {
    running: s.running,
    config: s.config,
    startedBy: s.startedBy,
    startedAt: s.startedAt,
    stoppedAt: s.stoppedAt,
    stopReason: s.stopReason,
    autoStopAt: s.autoStopAt,
    nextTickAt: s.nextTickAt,
    simulatedTime: sim,
    simulatedLocalHour: round(hourOfDay(sim, s.config.timezone), 2),
    stats: {
      ticks: s.ticks,
      readingsGenerated: s.readingsGenerated,
      readingsRejected: s.readingsRejected,
      alertsCreated: s.alertsCreated,
      alertsUpdated: s.alertsUpdated,
    },
    lastTick: s.lastTick,
    lastError: s.lastError,
    pendingAnomalies: [...s.anomalies.values()].map((a) => ({ assetCode: a.assetCode, type: a.type, remainingTicks: a.remaining, random: Boolean(a.random) })),
    recentAlerts: s.recentAlerts,
    anomalyTypes: ANOMALIES,
  };
};

const isRunning = () => Boolean(state?.running);

module.exports = { start, stop, getStatus, injectAnomaly, isRunning, parseConfig, ANOMALIES };
