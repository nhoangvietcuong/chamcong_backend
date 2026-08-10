const jwt = require('jsonwebtoken');
require('dotenv').config();

const generateAccessToken = (payload) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET must be configured in environment.');
  }
  return jwt.sign(payload, secret, { expiresIn });
};

const verifyAccessToken = (token) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET must be configured in environment.');
  }
  return jwt.verify(token, secret);
};

module.exports = {
  generateAccessToken,
  verifyAccessToken,
};
