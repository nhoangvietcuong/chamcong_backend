const crypto = require('crypto');
require('dotenv').config();

const hashRefreshToken = (token) => {
  const secret = process.env.REFRESH_TOKEN_HASH_SECRET;
  if (!secret) {
    throw new Error('REFRESH_TOKEN_HASH_SECRET must be configured in environment.');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('hex');
};

module.exports = {
  hashRefreshToken,
};
