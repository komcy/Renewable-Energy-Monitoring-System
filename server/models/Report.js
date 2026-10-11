const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const REPORT_TYPES = ['PlantPerformance', 'AlertFrequency', 'TelemetryExport'];
const GRANULARITIES = ['Daily', 'Weekly', 'Monthly'];

/**
 * A generated report: its parameters, a summary and (for the aggregate
 * reports) the result table. Telemetry exports store only parameters and a
 * summary; their rows are streamed fresh on download, since they can be far
 * larger than a MongoDB document allows.
 */
const reportSchema = new mongoose.Schema(
  {
    reportType: { type: String, enum: REPORT_TYPES, required: true },
    title: { type: String, trim: true, maxlength: 200 },
    // Optional scope; no plant means the whole fleet
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant' },
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    granularity: { type: String, enum: GRANULARITIES, default: 'Daily' },
    timezone: { type: String, default: 'UTC' },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rowCount: { type: Number, default: 0 },
    // Headline figures for the report
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Column definitions and rows (aggregate reports only)
    columns: { type: [{ key: String, label: String, _id: false }], default: undefined },
    rows: { type: [mongoose.Schema.Types.Mixed], default: undefined, select: false },
    // Extra tables (e.g. alerts by asset), included in JSON downloads
    sections: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  baseOptions
);

reportSchema.path('period.end').validate(function (end) {
  return !this.period?.start || end >= this.period.start;
}, 'Period end must be on or after period start');

reportSchema.index({ generatedAt: -1 });
reportSchema.index({ reportType: 1, generatedAt: -1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
Object.assign(module.exports, { REPORT_TYPES, GRANULARITIES });
