"use strict";

const state = {
  currentTab: null,
  summary: null,
  isLoading: false,
  settings: {
    proxyUrl: "http://localhost:3000",
    autoHighlight: false,
    theme: "dark",
  },
};

const $ = (id) => document.getElementById(id);
const els = {
  shell: $("shell"),
  pageTitle: $("pageTitle"),
  pageUrl: $("pageUrl"),
  pageFavicon: $("pageFavicon"),
  cacheBadge: $("cacheBadge"),

  stateIdle: $("stateIdle"),
  stateLoading: $("stateLoading"),
  stateError: $("stateError"),
  stateResults: $("stateResults"),

  step1: $("step1"),
  step2: $("step2"),
  step3: $("step3"),

  errorMsg: $("errorMsg"),
  retryBtn: $("retryBtn"),

  readingTime: $("readingTime"),
  wordCount: $("wordCount"),
  summaryList: $("summaryList"),
  insightsList: $("insightsList"),
  tagsList: $("tagsList"),

  highlightToggle: $("highlightToggle"),

  summarizeBtn: $("summarizeBtn"),
  clearBtn: $("clearBtn"),
  copyBtn: $("copyBtn"),

  settingsBtn: $("settingsBtn"),
  closeSettings: $("closeSettings"),
  settingsPanel: $("settingsPanel"),
  themeToggle: $("themeToggle"),
  proxyUrlInput: $("proxyUrlInput"),
  autoHighlightToggle: $("autoHighlightToggle"),
  saveSettings: $("saveSettings"),
  clearCacheBtn: $("clearCacheBtn"),
};

async function init() {
  await loadSettings();
  await loadCurrentTab();
  setupEventListeners();
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      if (res?.success && res.settings) {
        state.settings = { ...state.settings, ...res.settings };
      }
      applyTheme(state.settings.theme || "dark");
      els.proxyUrlInput.value =
        state.settings.proxyUrl || "http://localhost:3000";
      els.autoHighlightToggle.checked = !!state.settings.autoHighlight;
      resolve();
    });
  });
}

async function loadCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      state.currentTab = tabs[0];
      if (state.currentTab) {
        updatePageInfo(state.currentTab);
      }
      resolve();
    });
  });
}

function updatePageInfo(tab) {
  els.pageTitle.textContent = tab.title || "Untitled Page";
  try {
    const url = new URL(tab.url);
    els.pageUrl.textContent =
      url.hostname + (url.pathname !== "/" ? url.pathname : "");
  } catch {
    els.pageUrl.textContent = tab.url;
  }

  if (tab.favIconUrl) {
    const img = document.createElement("img");
    img.src = tab.favIconUrl;
    img.onerror = () => {
      els.pageFavicon.innerHTML = "";
    };
    els.pageFavicon.appendChild(img);
  }
}

function setupEventListeners() {
  els.summarizeBtn.addEventListener("click", handleSummarize);
  els.retryBtn.addEventListener("click", handleSummarize);
  els.clearBtn.addEventListener("click", handleClear);
  els.copyBtn.addEventListener("click", handleCopy);
  els.settingsBtn.addEventListener("click", openSettings);
  els.closeSettings.addEventListener("click", closeSettings);
  els.saveSettings.addEventListener("click", handleSaveSettings);
  els.clearCacheBtn.addEventListener("click", handleClearCache);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.highlightToggle.addEventListener("change", handleHighlightToggle);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !state.isLoading && showingState() !== "results") {
      handleSummarize();
    }
    if (e.key === "Escape" && !els.settingsPanel.classList.contains("hidden")) {
      closeSettings();
    }
  });
}

async function handleSummarize() {
  if (state.isLoading) return;

  try {
    setLoading(true);
    showState("loading");
    animateLoadingSteps();

    const contentData = await extractPageContent();
    setStepDone(1);

    setStepActive(2);
    const result = await summarizeContent(contentData);
    setStepDone(2);

    setStepActive(3);
    await new Promise((r) => setTimeout(r, 400));
    setStepDone(3);

    state.summary = result;
    renderResults(result);
    showState("results");

    if (state.settings.autoHighlight && result.highlights?.length) {
      els.highlightToggle.checked = true;
      sendHighlights(result.highlights);
    }
  } catch (err) {
    console.error("[Sumly] Error:", err);
    showError(
      err.message || "Failed to summarize this page. Please try again.",
    );
    showState("error");
  } finally {
    setLoading(false);
  }
}

function requestExtraction(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "EXTRACT_CONTENT" }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!response?.success) {
        return reject(
          new Error(response?.error || "Failed to extract page content."),
        );
      }
      resolve(response.data);
    });
  });
}

async function extractPageContent() {
  const tabId = state.currentTab?.id;
  if (!tabId) throw new Error("No active tab found.");

  try {
    return await requestExtraction(tabId);
  } catch {
    // Content script may be absent (page opened before the extension loaded).
    // Inject it, then retry once.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content.js"],
      });
    } catch {
      throw new Error(
        "Cannot access this page. Try a regular website (not chrome:// or the Web Store).",
      );
    }
    try {
      return await requestExtraction(tabId);
    } catch {
      throw new Error(
        "Cannot read this page. Reload the page, then summarize again.",
      );
    }
  }
}

async function summarizeContent(pageData) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SUMMARIZE", pageData }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error("Extension error. Please try reloading."));
      }
      if (!response?.success) {
        return reject(new Error(response?.error || "Failed to get summary."));
      }
      resolve(response.result);
    });
  });
}

function renderResults(result) {
  els.readingTime.textContent = result.readingTimeMinutes || "—";
  els.wordCount.textContent = result.wordCount
    ? result.wordCount.toLocaleString()
    : "—";

  els.cacheBadge.classList.toggle("hidden", !result.fromCache);

  els.summaryList.innerHTML = "";
  (result.summary || []).forEach((point, i) => {
    const li = document.createElement("li");
    li.textContent = point;
    li.style.animationDelay = `${i * 60}ms`;
    els.summaryList.appendChild(li);
  });

  els.insightsList.innerHTML = "";
  (result.insights || []).forEach((insight, i) => {
    const div = document.createElement("div");
    div.className = "insight-item";
    div.style.animationDelay = `${i * 60 + 100}ms`;
    div.innerHTML = `
      <span class="insight-num">${String(i + 1).padStart(2, "0")}</span>
      <span>${escapeHtml(insight)}</span>
    `;
    els.insightsList.appendChild(div);
  });

  els.tagsList.innerHTML = "";
  (result.topics || []).forEach((topic, i) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = topic;
    span.style.animationDelay = `${i * 40 + 200}ms`;
    els.tagsList.appendChild(span);
  });
}

function handleHighlightToggle(e) {
  if (!state.summary) return;

  if (e.target.checked && state.summary.highlights?.length) {
    sendHighlights(state.summary.highlights);
  } else {
    clearHighlights();
  }
}

function sendHighlights(phrases) {
  if (!state.currentTab?.id) return;
  chrome.tabs.sendMessage(
    state.currentTab.id,
    { type: "HIGHLIGHT_TEXT", phrases },
    // Swallow "Receiving end does not exist" when no content script is present.
    () => void chrome.runtime.lastError,
  );
}

function clearHighlights() {
  if (!state.currentTab?.id) return;
  chrome.tabs.sendMessage(
    state.currentTab.id,
    { type: "CLEAR_HIGHLIGHTS" },
    () => void chrome.runtime.lastError,
  );
}

function handleClear() {
  state.summary = null;
  els.cacheBadge.classList.add("hidden");
  els.highlightToggle.checked = false;
  clearHighlights();
  showState("idle");
}

async function handleCopy() {
  if (!state.summary) return;

  const parts = [];

  if (state.summary.summary?.length) {
    parts.push("## Summary");
    state.summary.summary.forEach((s) => parts.push(`• ${s}`));
  }

  if (state.summary.insights?.length) {
    parts.push("\n## Key Insights");
    state.summary.insights.forEach((ins, i) => parts.push(`${i + 1}. ${ins}`));
  }

  if (state.summary.topics?.length) {
    parts.push(`\n## Topics: ${state.summary.topics.join(", ")}`);
  }

  if (state.summary.readingTimeMinutes) {
    parts.push(`\n⏱ ${state.summary.readingTimeMinutes} min read`);
  }

  try {
    await navigator.clipboard.writeText(parts.join("\n"));
    els.copyBtn.classList.add("copied");
    els.copyBtn.textContent = " Copied!";
    setTimeout(() => {
      els.copyBtn.classList.remove("copied");
      els.copyBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg> Copy`;
    }, 2000);
  } catch (e) {
    console.error("Copy failed:", e);
  }
}

function openSettings() {
  els.settingsPanel.classList.remove("hidden");
}

function closeSettings() {
  els.settingsPanel.classList.add("hidden");
}

function handleSaveSettings() {
  const settings = {
    proxyUrl: els.proxyUrlInput.value.trim() || "http://localhost:3000",
    autoHighlight: els.autoHighlightToggle.checked,
    theme: state.settings.theme,
  };

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, () => {
    state.settings = settings;
    closeSettings();
  });
}

function handleClearCache() {
  chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }, () => {
    els.clearCacheBtn.textContent = " Cache Cleared";
    setTimeout(() => {
      els.clearCacheBtn.textContent = "Clear All Cached Summaries";
    }, 2000);
  });
}

function toggleTheme() {
  const newTheme = state.settings.theme === "dark" ? "light" : "dark";
  state.settings.theme = newTheme;
  applyTheme(newTheme);
  chrome.storage.sync.set({ theme: newTheme });
}

function applyTheme(theme) {
  els.shell.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

const allStates = ["idle", "loading", "error", "results"];

function showState(name) {
  allStates.forEach((s) => {
    const el = $(`state${capitalize(s)}`);
    if (el) el.classList.toggle("hidden", s !== name);
  });
}

function showingState() {
  return allStates.find(
    (s) => !$(`state${capitalize(s)}`)?.classList.contains("hidden"),
  );
}

function setLoading(val) {
  state.isLoading = val;
  els.summarizeBtn.disabled = val;
}

function showError(msg) {
  els.errorMsg.textContent = msg;
}

function animateLoadingSteps() {
  [els.step1, els.step2, els.step3].forEach((s) => {
    s.classList.remove("active", "done");
  });
  els.step1.classList.add("active");
}

function setStepDone(n) {
  const el = $(`step${n}`);
  el.classList.remove("active");
  el.classList.add("done");
}

function setStepActive(n) {
  const el = $(`step${n}`);
  el.classList.add("active");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
