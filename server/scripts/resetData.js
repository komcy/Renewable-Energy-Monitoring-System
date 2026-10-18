/**
 * Wipes all REMS data (plants, assets, telemetry, alerts, work orders, reports, counters)
 * and keeps user accounts. Run from the project root with the server stopped:
 *
 *   node server/scripts/resetData.js          shows what would be deleted
 *   node server/scripts/resetData.js --yes    deletes it
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const KEEP = ['users'];

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set in server/.env');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`Database: ${db.databaseName}\n`);

  const names = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !KEEP.includes(n));
  for (const n of names) console.log(`  ${n.padEnd(24)} ${await db.collection(n).countDocuments()} documents`);
  console.log(`\nKept: ${KEEP.join(', ')}`);

  if (!process.argv.includes('--yes')) {
    console.log('\nNothing deleted. Re-run with --yes to delete the data above.');
  } else {
    for (const n of names) await db.collection(n).deleteMany({});
    console.log('\nDone. All data cleared; user accounts kept.');
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('Failed:', e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
