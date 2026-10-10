const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const ALERT_TYPES = [
  'OutputDrop',
  'ZeroGeneration',
  'LowEfficiency',
  'OverTemperature',
  'HighWindSpeed',
  'CommunicationLoss',
  'PredictiveFailure',
  'Other',
];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const ALERT_STATUSES = ['Active', 'Acknowledged', 'Resolved'];

const alertSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    alertType: { type: String, enum: ALERT_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    message: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ALERT_STATUSES, default: 'Active' },
    // Value that triggered the alert and the threshold it violated
    observedValue: Number,
    thresholdValue: Number,
    reading: { type: mongoose.Schema.Types.ObjectId, ref: 'TelemetryReading' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNotes: { type: String, trim: true },
  },
  baseOptions
);

alertSchema.index({ status: 1, severity: 1, timestamp: -1 });
alertSchema.index({ asset: 1, alertType: 1, status: 1 });

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
Object.assign(module.exports, { ALERT_TYPES, SEVERITIES, ALERT_STATUSES });
