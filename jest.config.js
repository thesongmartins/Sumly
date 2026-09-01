const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Load next.config.js and .env files in the test environment
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/extension/**/*.test.js",
  ],
  clearMocks: true,
};

module.exports = createJestConfig(customJestConfig);
