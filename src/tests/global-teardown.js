const { adminPool } = require('./setup');

module.exports = async () => {
  await adminPool.end();
  console.log('Test execution completed and resources released.');
};
