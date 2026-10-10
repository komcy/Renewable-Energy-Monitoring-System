const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const telemetryReadingSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    powerOutput: { type: Number, required: true, min: 0 }, // kW
    cumulativeEnergy: { type: Number, min: 0, default: 0 }, // kWh
    efficiency: { type: Number, min: 0, max: 100 }, // %
    operatingStatus: {
      type: String,
      enum: ['Normal', 'Degraded', 'Fault', 'Offline'],
      default: 'Normal',
    },
    // Ambient / source parameters captured with the reading
    irradiance: Number, // W/m² (solar)
    temperature: Number, // °C (solar panel / ambient)
    windSpeed: Number, // m/s (wind)
    rotorSpeed: Number, // RPM (wind)
    source: { type: String, enum: ['simulator', 'csv', 'manual'], default: 'manual' },
  },
  { ...baseOptions, timestamps: false }
);

// Primary query pattern: readings for an asset over a time range
telemetryReadingSchema.index({ asset: 1, timestamp: -1 });
telemetryReadingSchema.index({ timestamp: -1 });

module.exports = mongoose.model('TelemetryReading', telemetryReadingSchema);
