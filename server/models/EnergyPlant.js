const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const energyPlantSchema = new mongoose.Schema(
  {
    plantName: { type: String, required: [true, 'Plant name is required'], trim: true, unique: true },
    location: {
      address: { type: String, trim: true },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    plantType: { type: String, enum: ['Solar', 'Wind', 'Hybrid'], required: true },
    // Total installed capacity in kW
    capacity: { type: Number, required: true, min: [0, 'Capacity cannot be negative'] },
    status: { type: String, enum: ['Operational', 'Maintenance', 'Offline'], default: 'Operational' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions
);

energyPlantSchema.virtual('assets', {
  ref: 'Asset',
  localField: '_id',
  foreignField: 'plant',
});

module.exports = mongoose.model('EnergyPlant', energyPlantSchema);
