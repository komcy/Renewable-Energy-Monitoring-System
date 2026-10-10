const simulator = require('../services/simulator');

/**
 * POST /api/simulator/start  (Admin, Operator)
 * Body (all optional): { intervalSeconds, timeScale, startHour, timezone, durationMinutes,
 *   anomalyRate, plant, assetCodes: [] }
 */
const startSimulator = async (req, res) => {
  const status = await simulator.start(req.body || {}, req.user);
  res.status(201).json({ success: true, message: 'Simulator started', data: status });
};

/** POST /api/simulator/stop  (Admin, Operator) */
const stopSimulator = async (req, res) => {
  const { wasRunning, status } = await simulator.stop(`stopped by ${req.user.name}`);
  res.json({ success: true, message: wasRunning ? 'Simulator stopped' : 'Simulator was not running', data: status });
};

/** GET /api/simulator/status */
const getSimulatorStatus = async (req, res) => {
  res.json({ success: true, data: simulator.getStatus() });
};

/** POST /api/simulator/anomaly  { assetCode | asset, type, ticks? }  (Admin, Operator) */
const injectAnomaly = async (req, res) => {
  const result = await simulator.injectAnomaly(req.body || {});
  res.status(202).json({ success: true, message: `Anomaly queued for the next ${result.ticks} tick(s)`, data: result });
};

module.exports = { startSimulator, stopSimulator, getSimulatorStatus, injectAnomaly };
