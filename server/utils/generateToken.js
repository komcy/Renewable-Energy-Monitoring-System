const jwt = require('jsonwebtoken');

const generateToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role, tv: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

module.exports = generateToken;
