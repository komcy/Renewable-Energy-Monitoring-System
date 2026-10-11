const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const baseOptions = require('./schemaOptions');

const ROLES = ['Admin', 'Operator', 'Viewer'];
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: { type: String, enum: ROLES, default: 'Viewer' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    // Bumped to invalidate every issued JWT ("sign out everywhere", password reset)
    tokenVersion: { type: Number, default: 0 },
    // Set when an admin issues a temporary password
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: Date,
  },
  {
    ...baseOptions,
    toJSON: {
      ...baseOptions.toJSON,
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.password;
        delete ret.tokenVersion;
        return ret;
      },
    },
  }
);

// Hash password whenever it is set or changed
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.ROLES = ROLES;
