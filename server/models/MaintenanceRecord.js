const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const MAINTENANCE_STATUSES = ['Scheduled', 'In Progress', 'Completed'];

const maintenanceRecordSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    maintenanceDate: { type: Date, required: [true, 'Maintenance date is required'] },
    description: { type: String, required: [true, 'Description is required'], trim: true },
    // Predicted probability of failure, 0–1
    failureProbability: { type: Number, min: 0, max: 1 },
    // Asset Health Index at the time the task was created, 0–100
    healthIndex: { type: Number, min: 0, max: 100 },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    status: { type: String, enum: MAINTENANCE_STATUSES, default: 'Scheduled' },
    origin: { type: String, enum: ['Predictive', 'Manual'], default: 'Manual' },
    relatedAlert: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    notes: { type: String, trim: true },
  },
  baseOptions
);

maintenanceRecordSchema.index({ asset: 1, status: 1 });
maintenanceRecordSchema.index({ status: 1, maintenanceDate: 1 });

const MaintenanceRecord = mongoose.model('MaintenanceRecord', maintenanceRecordSchema);

module.exports = MaintenanceRecord;
module.exports.MAINTENANCE_STATUSES = MAINTENANCE_STATUSES;
