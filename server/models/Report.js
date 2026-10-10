const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const reportSchema = new mongoose.Schema(
  {
    reportType: { type: String, enum: ['Daily', 'Weekly', 'Monthly'], required: true },
    // Scope: a single asset, a plant, or the whole farm when both are empty
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant' },
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Aggregated results (total kWh, peak kW, avg efficiency, availability, alert counts, ...)
    metricsPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  baseOptions
);

reportSchema.path('period.end').validate(function (end) {
  return !this.period?.start || end >= this.period.start;
}, 'Period end must be on or after period start');

reportSchema.index({ reportType: 1, 'period.start': -1 });

module.exports = mongoose.model('Report', reportSchema);
