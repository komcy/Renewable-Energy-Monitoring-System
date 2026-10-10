const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const SOURCE_TYPES = ['SolarPanel', 'WindTurbine'];

// Source-specific parameters (latest known values + rated specs)
const solarSpecsSchema = new mongoose.Schema(
  {
    irradiance: { type: Number, min: 0 }, // W/m²
    temperature: { type: Number }, // °C, panel temperature
    panelArea: { type: Number, min: 0 }, // m²
    ratedEfficiency: { type: Number, min: 0, max: 100 }, // %
    tiltAngle: { type: Number, min: 0, max: 90 }, // degrees
  },
  { _id: false }
);

const windSpecsSchema = new mongoose.Schema(
  {
    windSpeed: { type: Number, min: 0 }, // m/s
    rotorSpeed: { type: Number, min: 0 }, // RPM
    rotorDiameter: { type: Number, min: 0 }, // m
    hubHeight: { type: Number, min: 0 }, // m
    cutInSpeed: { type: Number, min: 0, default: 3 }, // m/s
    ratedWindSpeed: { type: Number, min: 0, default: 12 }, // m/s
    cutOutSpeed: { type: Number, min: 0, default: 25 }, // m/s
  },
  { _id: false }
);

// Per-asset fault detection thresholds (used by the fault engine)
const thresholdsSchema = new mongoose.Schema(
  {
    minEfficiency: { type: Number, min: 0, max: 100, default: 40 }, // %
    outputDropPercent: { type: Number, min: 0, max: 100, default: 50 }, // % drop between readings
    maxTemperature: { type: Number, default: 75 }, // °C (solar)
    maxWindSpeed: { type: Number, default: 25 }, // m/s (wind)
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    assetCode: {
      type: String,
      required: [true, 'Asset code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: [true, 'Asset name is required'], trim: true },
    sourceType: { type: String, enum: SOURCE_TYPES, required: [true, 'Source type is required'] },
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant' },
    // Rated capacity in kW
    capacity: { type: Number, required: [true, 'Capacity is required'], min: [0, 'Capacity cannot be negative'] },
    status: { type: String, enum: ['Active', 'Deactivated'], default: 'Active' },
    location: { type: String, trim: true },
    installationDate: Date,
    solarSpecs: solarSpecsSchema,
    windSpecs: windSpecsSchema,
    thresholds: { type: thresholdsSchema, default: () => ({}) },
    healthIndex: { type: Number, min: 0, max: 100, default: 100 },
    lastReadingAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions
);

// Keep only the spec block that matches the source type
assetSchema.pre('validate', function () {
  if (this.sourceType === 'SolarPanel') {
    this.windSpecs = undefined;
    if (!this.solarSpecs) this.solarSpecs = {};
  } else if (this.sourceType === 'WindTurbine') {
    this.solarSpecs = undefined;
    if (!this.windSpecs) this.windSpecs = {};
  }
});

assetSchema.index({ sourceType: 1, status: 1 });
assetSchema.index({ plant: 1 });

const Asset = mongoose.model('Asset', assetSchema);

module.exports = Asset;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
