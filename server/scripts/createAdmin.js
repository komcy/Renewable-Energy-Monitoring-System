/**
 * Creates the first Admin account (or promotes an existing user to Admin).
 * Registration via the API always creates Viewers, so use this to bootstrap.
 *
 * Usage: npm run create-admin -- "<name>" <email> <password>
 */
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const [name, email, password] = process.argv.slice(2);

const run = async () => {
  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- "<name>" <email> <password>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.role = 'Admin';
    existing.isActive = true;
    await existing.save();
    console.log(`Promoted existing user ${existing.email} to Admin.`);
  } else {
    const user = await User.create({ name, email, password, role: 'Admin' });
    console.log(`Created Admin ${user.email}.`);
  }
};

run()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
