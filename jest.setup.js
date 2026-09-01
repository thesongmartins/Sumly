// Global test setup — provides a minimal `chrome` extension API stub so that
// importing the service worker (background.js) does not throw at module load.

// Deterministic API key for the route tests (never the real .env.local secret).
process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_MODEL = "gemini-test";

function listenerStub() {
  return { addListener: jest.fn(), removeListener: jest.fn() };
}

global.chrome = {
  runtime: {
    onMessage: listenerStub(),
    onConnect: listenerStub(),
    getManifest: jest.fn(() => ({ version: "1.0.0" })),
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((items, cb) => cb && cb()),
      remove: jest.fn((keys, cb) => cb && cb()),
      clear: jest.fn((cb) => cb && cb()),
    },
    sync: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((items, cb) => cb && cb()),
    },
  },
  tabs: {
    query: jest.fn((opts, cb) => cb([])),
    sendMessage: jest.fn(),
  },
};
