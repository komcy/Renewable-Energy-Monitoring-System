const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const OPERATING_STATUSES = ['Normal', 'Degraded', 'Fault', 'Offline'];

// Numeric fields a client may query/chart
const METRIC_FIELDS = [
  'powerOutput',
  'cumulativeEnergy',
  'efficiency',
  'expectedPower',
  'irradiance',
  'temperature',
  'windSpeed',
  'rotorSpeed',
  'stateOfCharge',
];

const telemetryReadingSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    // Denormalised so plant-level queries don't need a join
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant' },
    timestamp: { type: Date, required: true, default: Date.now },
    // kW; negative only for batteries while charging
    powerOutput: { type: Number, required: true },
    cumulativeEnergy: { type: Number, min: 0, default: 0 }, // kWh
    efficiency: { type: Number, min: 0, max: 100 }, // % of expected output
    expectedPower: { type: Number, min: 0 }, // kW predicted from conditions
    operatingStatus: { type: String, enum: OPERATING_STATUSES, default: 'Normal' },
    irradiance: { type: Number, min: 0 }, // W/m² (solar)
    temperature: Number, // °C (panel / inverter / battery / transformer)
    windSpeed: { type: Number, min: 0 }, // m/s (wind)
    rotorSpeed: { type: Number, min: 0 }, // RPM (wind)
    stateOfCharge: { type: Number, min: 0, max: 100 }, // % (battery)
    source: { type: String, enum: ['simulator', 'csv', 'manual', 'api'], default: 'api' },
  },
  { ...baseOptions, timestamps: false }
);

telemetryReadingSchema.index({ asset: 1, timestamp: -1 });
telemetryReadingSchema.index({ plant: 1, timestamp: -1 });
telemetryReadingSchema.index({ timestamp: -1 });

const TelemetryReading = mongoose.model('TelemetryReading', telemetryReadingSchema);

module.exports = TelemetryReading;
Object.assign(module.exports, { OPERATING_STATUSES, METRIC_FIELDS });
