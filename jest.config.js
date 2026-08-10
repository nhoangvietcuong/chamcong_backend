module.exports = {
  testEnvironment: 'node',
  verbose: true,
  globalSetup: '<rootDir>/src/tests/global-setup.js',
  globalTeardown: '<rootDir>/src/tests/global-teardown.js',
  testMatch: ['**/src/tests/**/*.test.js'],
};
