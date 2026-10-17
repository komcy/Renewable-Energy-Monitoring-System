/**
 * Creates the plants and assets described in samples/kaggle/assets.json.
 * Safe to re-run: existing plants/assets (matched by name / assetCode) are updated, not duplicated.
 *
 *   node server/scripts/seedKaggle.js      (run buildKaggleCsv.js first)
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const EnergyPlant = require('../models/EnergyPlant');
const Asset = require('../models/Asset');

const file = path.join(__dirname, '..', 'samples', 'kaggle', 'assets.json');

(async () => {
  if (!fs.existsSync(file)) throw new Error('assets.json not found. Run buildKaggleCsv.js first.');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set in server/.env');
  const { plants, assets } = JSON.parse(fs.readFileSync(file, 'utf8'));
  await mongoose.connect(process.env.MONGO_URI);

  const plantIds = {};
  for (const p of plants) {
    const doc = (await EnergyPlant.findOne({ plantName: p.plantName })) || new EnergyPlant();
    doc.set({ ...p, status: 'Operational' });
    await doc.save();
    plantIds[p.plantName] = doc._id;
    console.log(`plant  ${p.plantName} (${p.capacity} kW)`);
  }
  for (const a of assets) {
    const { plantName, ...rest } = a;
    const doc = (await Asset.findOne({ assetCode: a.assetCode })) || new Asset();
    doc.set({
      ...rest,
      plant: plantIds[plantName],
      status: 'Active',
      thresholds: Asset.DEFAULT_THRESHOLDS[a.sourceType],
    });
    await doc.save();
    console.log(`asset  ${a.assetCode}  ${a.name}`);
  }
  console.log(`\nDone: ${plants.length} plants, ${assets.length} assets.`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('Failed:', e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
