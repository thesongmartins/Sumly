// Service worker — handles all AI API communication. Never exposes keys to
// content/popup.
const CACHE_TTL_MS = 30 * 60 * 1000;

// Optional shared secret. Leave empty to disable. When set, it must match the
// server's EXTENSION_SHARED_SECRET env var and is sent as x-extension-secret.
// (A secret shipped in a public extension is extractable — private use only.)
const EXTENSION_SECRET = "";

// Stable 53-bit hash (cyrb53) — Unicode-safe, collision-resistant cache keys.
function hashUrl(str) {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function cacheKeyFor(url) {
  return `summary_${hashUrl(url)}`;
}

// Resets on service worker restart.
const rateLimiter = {
  requests: [],
  maxRequests: 10,
  windowMs: 60 * 1000,

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);
    return this.requests.length < this.maxRequests;
  },

  record() {
    this.requests.push(Date.now());
  },
};

async function getCachedSummary(url) {
  return new Promise((resolve) => {
    const cacheKey = cacheKeyFor(url);
    chrome.storage.local.get([cacheKey], (result) => {
      const cached = result[cacheKey];
      if (!cached) return resolve(null);
      if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
        chrome.storage.local.remove([cacheKey]);
        return resolve(null);
      }
      resolve(cached.data);
    });
  });
}

async function cacheSummary(url, data) {
  const cacheKey = cacheKeyFor(url);
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [cacheKey]: { data, timestamp: Date.now() } },
      resolve,
    );
  });
}

async function summarizePage(pageData) {
  const { url, title, content, wordCount, metaDescription } = pageData;

  const cached = await getCachedSummary(url);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  if (!rateLimiter.canMakeRequest()) {
    throw new Error(
      "Rate limit reached. Please wait a moment before summarizing again.",
    );
  }
  rateLimiter.record();

  const settings = await new Promise((resolve) =>
    chrome.storage.sync.get(["proxyUrl"], resolve),
  );
  const baseUrl = settings.proxyUrl || "http://localhost:3000";
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const endpointUrl = `${cleanBaseUrl}/api/summarize`;

  const headers = {
    "Content-Type": "application/json",
    "X-Extension-Version": chrome.runtime.getManifest().version,
  };
  if (EXTENSION_SECRET) headers["X-Extension-Secret"] = EXTENSION_SECRET;

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      url,
      content,
      wordCount,
      metaDescription,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `API error: ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();
  await cacheSummary(url, result);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    summarizePage(message.pageData)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "CLEAR_CACHE") {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.sync.get(["proxyUrl", "autoHighlight", "theme"], (result) => {
      sendResponse({ success: true, settings: result });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.sync.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepalive") {
    port.onDisconnect.addListener(() => {});
  }
});

// Exported for unit tests; ignored by the Chrome service-worker runtime.
export { hashUrl, cacheKeyFor, rateLimiter, CACHE_TTL_MS };
