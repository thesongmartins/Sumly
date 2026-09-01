// Content script — extracts clean, readable content and highlights phrases.

(function () {
  "use strict";

  // Priority order: <article>, [role=main], <main>, then the largest text block.
  function extractContent() {
    const title = document.title || "";
    const url = window.location.href;

    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      "aside",
      "[role='navigation']",
      "[role='banner']",
      "[role='complementary']",
      ".nav",
      ".navbar",
      ".sidebar",
      ".widget",
      ".ad",
      ".ads",
      ".advertisement",
      ".social-share",
      ".comments",
      "#comments",
      ".cookie-banner",
      ".popup",
      ".modal",
      ".newsletter",
      "script",
      "style",
      "noscript",
      "iframe",
    ];

    // Clone so removing noise doesn't mutate the live DOM.
    const bodyClone = document.body.cloneNode(true);

    noiseSelectors.forEach((sel) => {
      bodyClone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    const contentSelectors = [
      "article",
      "[role='main']",
      "main",
      ".post-content",
      ".article-content",
      ".entry-content",
      ".content-body",
      "#content",
      ".post-body",
      ".story-body",
    ];

    let contentEl = null;
    for (const sel of contentSelectors) {
      const el = bodyClone.querySelector(sel);
      // Read innerText once — each access forces a reflow.
      if (el && el.innerText.trim().length > 200) {
        contentEl = el;
        break;
      }
    }

    // Fallback: largest text block. Cache innerText length to avoid reflows.
    if (!contentEl) {
      let best = null;
      let bestLen = 200;
      bodyClone.querySelectorAll("div, section").forEach((el) => {
        const len = el.innerText.trim().length;
        if (len > bestLen) {
          bestLen = len;
          best = el;
        }
      });
      contentEl = best || bodyClone;
    }

    let rawText = contentEl ? contentEl.innerText : bodyClone.innerText;
    rawText = rawText
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    // Cap at ~6000 words to keep API cost/latency reasonable.
    const words = rawText.split(/\s+/);
    const truncated = words.slice(0, 6000).join(" ");
    const wasTruncated = words.length > 6000;

    const metaDesc =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") || "";

    return {
      title,
      url,
      content: truncated,
      wordCount: words.length,
      wasTruncated,
      metaDescription: metaDesc,
    };
  }

  function highlightText(phrases) {
    document.querySelectorAll(".sumly-highlight").forEach((el) => {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    });

    if (!phrases || phrases.length === 0) return;

    const style = document.createElement("style");
    style.id = "sumly-styles";
    style.textContent = `
      .sumly-highlight {
        background: linear-gradient(120deg, #ffd60a55 0%, #ffd60a99 100%);
        border-radius: 3px;
        padding: 1px 2px;
        transition: background 0.2s ease;
      }
      .sumly-highlight:hover {
        background: linear-gradient(120deg, #ffd60a99 0%, #ffd60add 100%);
      }
    `;

    const existingStyle = document.getElementById("sumly-styles");
    if (existingStyle) existingStyle.remove();
    document.head.appendChild(style);

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (["script", "style", "noscript"].includes(tag))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    phrases.slice(0, 10).forEach((phrase) => {
      if (!phrase || phrase.length < 10) return;
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");

      textNodes.forEach((textNode) => {
        if (!regex.test(textNode.textContent)) return;
        regex.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        const text = textNode.textContent;

        while ((match = regex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            frag.appendChild(
              document.createTextNode(text.slice(lastIndex, match.index)),
            );
          }
          const span = document.createElement("span");
          span.className = "sumly-highlight";
          span.textContent = match[1]; // textContent, not innerHTML — XSS-safe
          frag.appendChild(span);
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        textNode.parentNode.replaceChild(frag, textNode);
      });
    });
  }

  function clearHighlights() {
    document.querySelectorAll(".sumly-highlight").forEach((el) => {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    });
    const style = document.getElementById("sumly-styles");
    if (style) style.remove();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXTRACT_CONTENT") {
      try {
        const data = extractContent();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === "HIGHLIGHT_TEXT") {
      try {
        highlightText(message.phrases);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === "CLEAR_HIGHLIGHTS") {
      clearHighlights();
      sendResponse({ success: true });
    }
    return true; // keep the message channel open for the async response
  });
})();
