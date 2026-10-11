const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const MAINTENANCE_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const MAINTENANCE_TYPES = ['Preventive', 'Corrective', 'Inspection'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
// Open work orders flag their asset as "under maintenance"
const OPEN_STATUSES = ['Scheduled', 'In Progress'];

// Allowed status changes (Completed is final; Cancelled can be reopened)
const TRANSITIONS = {
  Scheduled: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Scheduled', 'Cancelled'],
  Completed: [],
  Cancelled: ['Scheduled'],
};

const statusChangeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: MAINTENANCE_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const maintenanceRecordSchema = new mongoose.Schema(
  {
    // Human-friendly id, e.g. WO-000123
    workOrderNumber: { type: String, unique: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 4000 },
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: [true, 'Asset is required'] },
    // Denormalised from the asset for plant-level queries
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant', required: true },
    maintenanceType: { type: String, enum: MAINTENANCE_TYPES, default: 'Preventive' },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    status: { type: String, enum: MAINTENANCE_STATUSES, default: 'Scheduled' },
    scheduledDate: { type: Date, required: [true, 'Scheduled date is required'] },
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    // Cost in INR
    cost: { type: Number, min: [0, 'Cost cannot be negative'] },
    technician: { type: String, trim: true, maxlength: 100 },
    technicianNotes: { type: String, trim: true, maxlength: 4000 },
    // Predictive diagnostics (later): estimated failure probability 0–1 and health index 0–100
    failureProbability: { type: Number, min: 0, max: 1 },
    healthIndex: { type: Number, min: 0, max: 100 },
    origin: { type: String, enum: ['Manual', 'Alert', 'Predictive'], default: 'Manual' },
    relatedAlert: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  baseOptions
);

maintenanceRecordSchema.virtual('isOverdue').get(function () {
  return this.status === 'Scheduled' && this.scheduledDate && this.scheduledDate < new Date();
});

// Assign the next work order number on first save
maintenanceRecordSchema.pre('save', async function () {
  if (this.workOrderNumber) return;
  const last = await this.constructor.findOne({}, { workOrderNumber: 1 }).sort({ createdAt: -1, _id: -1 }).lean();
  const n = last?.workOrderNumber ? Number(last.workOrderNumber.replace(/\D/g, '')) + 1 : 1;
  this.workOrderNumber = `WO-${String(n).padStart(6, '0')}`;
});

maintenanceRecordSchema.index({ asset: 1, status: 1 });
maintenanceRecordSchema.index({ plant: 1, status: 1 });
maintenanceRecordSchema.index({ status: 1, scheduledDate: 1 });

const MaintenanceRecord = mongoose.model('MaintenanceRecord', maintenanceRecordSchema);

module.exports = MaintenanceRecord;
Object.assign(module.exports, { MAINTENANCE_STATUSES, MAINTENANCE_TYPES, PRIORITIES, OPEN_STATUSES, TRANSITIONS });
