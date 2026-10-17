/** User-editable specification fields per asset type, and the alert thresholds that apply to each. */
export const ASSET_SPEC_FIELDS = {
  SolarPanel: {
    key: 'solarSpecs',
    fields: [
      { name: 'panelArea', label: 'Panel area', unit: 'm²' },
      { name: 'ratedEfficiency', label: 'Rated efficiency', unit: '%', max: 100 },
      { name: 'tiltAngle', label: 'Tilt angle', unit: '°', max: 90 },
    ],
  },
  WindTurbine: {
    key: 'windSpecs',
    fields: [
      { name: 'rotorDiameter', label: 'Rotor diameter', unit: 'm' },
      { name: 'hubHeight', label: 'Hub height', unit: 'm' },
      { name: 'cutInSpeed', label: 'Cut-in wind speed', unit: 'm/s', default: 3 },
      { name: 'ratedWindSpeed', label: 'Rated wind speed', unit: 'm/s', default: 12 },
      { name: 'cutOutSpeed', label: 'Cut-out wind speed', unit: 'm/s', default: 25 },
    ],
  },
  Inverter: {
    key: 'inverterSpecs',
    fields: [
      { name: 'ratedEfficiency', label: 'Rated efficiency', unit: '%', max: 100, default: 97 },
      { name: 'maxInputVoltage', label: 'Max input voltage', unit: 'V DC' },
      { name: 'outputVoltage', label: 'Output voltage', unit: 'V AC' },
    ],
  },
  BatteryStorage: {
    key: 'batterySpecs',
    fields: [
      { name: 'energyCapacity', label: 'Energy capacity', unit: 'kWh' },
      { name: 'chemistry', label: 'Chemistry', text: true, placeholder: 'e.g. LFP, NMC' },
    ],
  },
  Transformer: {
    key: 'transformerSpecs',
    fields: [
      { name: 'primaryVoltage', label: 'Primary voltage', unit: 'kV' },
      { name: 'secondaryVoltage', label: 'Secondary voltage', unit: 'kV' },
      { name: 'coolingType', label: 'Cooling type', text: true, placeholder: 'e.g. ONAN' },
    ],
  },
}

const GENERATING = ['SolarPanel', 'WindTurbine']
const THRESHOLDS = [
  { name: 'minEfficiency', label: 'Minimum efficiency', unit: '%', max: 100, types: GENERATING, default: 40, hint: 'Alert below this share of expected output' },
  { name: 'outputDropPercent', label: 'Output drop', unit: '%', max: 100, types: GENERATING, default: 50, hint: 'Alert on a drop larger than this between readings' },
  { name: 'maxTemperature', label: 'Max temperature', unit: '°C', min: -50, default: 75, hint: 'Alert above this temperature' },
  { name: 'maxWindSpeed', label: 'Max wind speed', unit: 'm/s', types: ['WindTurbine'], default: 25, hint: 'Alert above this wind speed' },
  { name: 'minStateOfCharge', label: 'Min state of charge', unit: '%', max: 100, types: ['BatteryStorage'], default: 20, hint: 'Alert below this charge level' },
]
const TEMPERATURE_BY_TYPE = { SolarPanel: 75, WindTurbine: 80, Inverter: 80, BatteryStorage: 45, Transformer: 95 }

/** Thresholds relevant to an asset type. */
export const thresholdsFor = (type) => THRESHOLDS.filter((t) => !t.types || t.types.includes(type))

/** Server defaults, mirrored so the form can pre-fill them on create. */
export const defaultThreshold = (type, name) =>
  name === 'maxTemperature' ? TEMPERATURE_BY_TYPE[type] : THRESHOLDS.find((t) => t.name === name)?.default

/** Id of a populated or plain reference. */
export const refId = (ref) => (ref && typeof ref === 'object' ? (ref.id ?? ref._id) : ref)
