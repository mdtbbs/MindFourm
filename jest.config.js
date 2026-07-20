module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  moduleNameMapper: {
    '^@entities/(.*)$': '<rootDir>/src/entities/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
  },
};
