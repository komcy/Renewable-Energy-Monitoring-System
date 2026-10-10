const mongoose = require('mongoose');
const baseOptions = require('./schemaOptions');

const SOURCE_TYPES = ['SolarPanel', 'WindTurbine', 'Inverter', 'BatteryStorage', 'Transformer'];
const GENERATING_TYPES = ['SolarPanel', 'WindTurbine'];

// Which spec sub-document belongs to which asset type
const SPEC_FIELDS = {
  SolarPanel: 'solarSpecs',
  WindTurbine: 'windSpecs',
  Inverter: 'inverterSpecs',
  BatteryStorage: 'batterySpecs',
  Transformer: 'transformerSpecs',
};

// Type-specific threshold defaults, merged over the schema defaults on creation
const DEFAULT_THRESHOLDS = {
  SolarPanel: { maxTemperature: 75 },
  WindTurbine: { maxTemperature: 80 },
  Inverter: { maxTemperature: 80 },
  BatteryStorage: { maxTemperature: 45 },
  Transformer: { maxTemperature: 95 },
};

const solarSpecsSchema = new mongoose.Schema(
  {
    irradiance: { type: Number, min: 0 }, // W/m², latest reading
    temperature: { type: Number }, // °C, latest panel temperature
    panelArea: { type: Number, min: 0 }, // m²
    ratedEfficiency: { type: Number, min: 0, max: 100 }, // %
    tiltAngle: { type: Number, min: 0, max: 90 }, // degrees
  },
  { _id: false }
);

const windSpecsSchema = new mongoose.Schema(
  {
    windSpeed: { type: Number, min: 0 }, // m/s, latest reading
    rotorSpeed: { type: Number, min: 0 }, // RPM, latest reading
    rotorDiameter: { type: Number, min: 0 }, // m
    hubHeight: { type: Number, min: 0 }, // m
    cutInSpeed: { type: Number, min: 0, default: 3 }, // m/s
    ratedWindSpeed: { type: Number, min: 0, default: 12 }, // m/s
    cutOutSpeed: { type: Number, min: 0, default: 25 }, // m/s
  },
  { _id: false }
);

const inverterSpecsSchema = new mongoose.Schema(
  {
    ratedEfficiency: { type: Number, min: 0, max: 100, default: 97 }, // %
    maxInputVoltage: { type: Number, min: 0 }, // V DC
    outputVoltage: { type: Number, min: 0 }, // V AC
    temperature: { type: Number }, // °C, latest reading
  },
  { _id: false }
);

const batterySpecsSchema = new mongoose.Schema(
  {
    energyCapacity: { type: Number, min: 0 }, // kWh storable
    chemistry: { type: String, trim: true }, // e.g. LFP, NMC
    stateOfCharge: { type: Number, min: 0, max: 100 }, // %, latest reading
    temperature: { type: Number }, // °C, latest reading
  },
  { _id: false }
);

const transformerSpecsSchema = new mongoose.Schema(
  {
    primaryVoltage: { type: Number, min: 0 }, // kV
    secondaryVoltage: { type: Number, min: 0 }, // kV
    coolingType: { type: String, trim: true }, // e.g. ONAN
    temperature: { type: Number }, // °C, latest reading
  },
  { _id: false }
);

// Per-asset fault detection thresholds (used by the alert engine)
const thresholdsSchema = new mongoose.Schema(
  {
    minEfficiency: { type: Number, min: 0, max: 100, default: 40 }, // % of expected output
    outputDropPercent: { type: Number, min: 0, max: 100, default: 50 }, // % drop between readings
    maxTemperature: { type: Number, default: 75 }, // °C
    maxWindSpeed: { type: Number, min: 0, default: 25 }, // m/s (wind)
    minStateOfCharge: { type: Number, min: 0, max: 100, default: 20 }, // % (battery)
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
      match: [/^[A-Z0-9_-]{2,30}$/, 'Asset code may contain only letters, digits, - and _ (2–30 chars)'],
    },
    name: { type: String, required: [true, 'Asset name is required'], trim: true, maxlength: 100 },
    sourceType: { type: String, enum: SOURCE_TYPES, required: [true, 'Source type is required'] },
    plant: { type: mongoose.Schema.Types.ObjectId, ref: 'EnergyPlant', required: [true, 'Plant is required'] },
    // Rated power capacity in kW
    capacity: { type: Number, required: [true, 'Capacity is required'], min: [0, 'Capacity cannot be negative'] },
    status: { type: String, enum: ['Active', 'Deactivated'], default: 'Active' },
    location: { type: String, trim: true, maxlength: 200 },
    installationDate: Date,
    solarSpecs: solarSpecsSchema,
    windSpecs: windSpecsSchema,
    inverterSpecs: inverterSpecsSchema,
    batterySpecs: batterySpecsSchema,
    transformerSpecs: transformerSpecsSchema,
    thresholds: { type: thresholdsSchema, default: () => ({}) },
    healthIndex: { type: Number, min: 0, max: 100, default: 100 },
    lastReadingAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions
);

// Keep only the spec block that matches the asset type
assetSchema.pre('validate', function () {
  const own = SPEC_FIELDS[this.sourceType];
  for (const field of Object.values(SPEC_FIELDS)) {
    if (field !== own) this.set(field, undefined);
  }
  if (own && !this.get(own)) this.set(own, {});
});

assetSchema.index({ sourceType: 1, status: 1 });
assetSchema.index({ plant: 1 });

const Asset = mongoose.model('Asset', assetSchema);

module.exports = Asset;
Object.assign(module.exports, { SOURCE_TYPES, GENERATING_TYPES, SPEC_FIELDS, DEFAULT_THRESHOLDS });
