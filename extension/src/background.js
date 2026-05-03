// background.js — Service Worker
// Handles all AI API communication. Never exposes keys to content/popup.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory rate limiting (resets on service worker restart)
const rateLimiter = {
  requests: [],
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);
    return this.requests.length < this.maxRequests;
  },

  record() {
    this.requests.push(Date.now());
  },
};

/**
 * Get cached summary for a URL
 */
async function getCachedSummary(url) {
  return new Promise((resolve) => {
    const cacheKey = `summary_${btoa(url).slice(0, 50)}`;
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

/**
 * Cache a summary for a URL
 */
async function cacheSummary(url, data) {
  const cacheKey = `summary_${btoa(url).slice(0, 50)}`;
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [cacheKey]: { data, timestamp: Date.now() } },
      resolve,
    );
  });
}

/**
 * Main summarization function — calls our Next.js proxy
 */
async function summarizePage(pageData) {
  const { url, title, content, wordCount, metaDescription } = pageData;

  // 1. Check cache
  const cached = await getCachedSummary(url);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // 2. Rate limiting
  if (!rateLimiter.canMakeRequest()) {
    throw new Error(
      "Rate limit reached. Please wait a moment before summarizing again.",
    );
  }

  // 3. Call proxy server
  rateLimiter.record();

  // Get base URL from settings (defaults to http://localhost:3000)
  const settings = await new Promise((resolve) => 
    chrome.storage.sync.get(["proxyUrl"], resolve)
  );
  const baseUrl = settings.proxyUrl || "http://localhost:3000";
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const endpointUrl = `${cleanBaseUrl}/api/summarize`;

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Extension-Version": chrome.runtime.getManifest().version,
    },
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

  // 4. Cache result
  await cacheSummary(url, result);

  return result;
}

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    summarizePage(message.pageData)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open
  }

  if (message.type === "CLEAR_CACHE") {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.sync.get(
      ["proxyUrl", "autoHighlight", "theme"],
      (result) => {
        sendResponse({ success: true, settings: result });
      },
    );
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.sync.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Service worker keep-alive ping handler
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepalive") {
    port.onDisconnect.addListener(() => {});
  }
});
