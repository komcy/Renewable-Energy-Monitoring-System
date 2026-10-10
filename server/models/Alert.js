const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const ALERT_TYPES = [
  'OutputDrop',
  'ZeroGeneration',
  'LowEfficiency',
  'OverTemperature',
  'HighWindSpeed',
  'LowStateOfCharge',
  'FaultStatus',
  'AssetOffline',
  'CommunicationLoss',
  'PredictiveFailure',
  'Other',
];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const ALERT_STATUSES = ['Active', 'Acknowledged', 'Resolved'];

const alertSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant' },
    alertType: { type: String, enum: ALERT_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    message: { type: String, required: true, trim: true },
    // First time the condition was detected
    timestamp: { type: Date, default: Date.now },
    // Repeated detections of the same open condition update these instead of
    // creating duplicate alerts
    lastOccurredAt: { type: Date, default: Date.now },
    occurrenceCount: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ALERT_STATUSES, default: 'Active' },
    observedValue: Number,
    thresholdValue: Number,
    reading: { type: mongoose.Schema.Types.ObjectId, ref: 'TelemetryReading' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
  },
  baseOptions
);

alertSchema.index({ status: 1, severity: 1, timestamp: -1 });
alertSchema.index({ asset: 1, alertType: 1, status: 1 });
alertSchema.index({ plant: 1, status: 1 });

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
Object.assign(module.exports, { ALERT_TYPES, SEVERITIES, ALERT_STATUSES });
