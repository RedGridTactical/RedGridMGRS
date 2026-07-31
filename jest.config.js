module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/utils/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  transformIgnorePatterns: [
    // @noble/* ships ESM-only (package "type": "module", no CJS condition), so
    // it has to go through babel or every crypto test dies on `import`.
    'node_modules/(?!(expo|@expo|react-native|@react-native|expo-location|expo-status-bar|expo-iap|@react-native-async-storage|@noble)/)',
  ],
  setupFilesAfterEnv: [],
};
