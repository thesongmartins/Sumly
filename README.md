# Sumly — AI Page Summarizer

A Chrome Extension (Manifest V3) + Next.js proxy server in a **single folder**.

---

## Project Structure

```
Sumly/
│
├── extension/                  ← Chrome Extension (load this in Chrome)
│   ├── manifest.json           ← Extension config & permissions
│   ├── popup.html              ← The popup window UI
│   ├── popup.css               ← Popup styles (dark/light mode)
│   ├── icons/                  ← Extension icons (16/32/48/128px)
│   └── src/
│       ├── popup.js            ← Popup logic & state management
│       ├── background.js       ← Service worker: API calls & cache
│       └── content.js          ← Runs on pages: extracts text & highlights
│
├── src/app/                    ← Next.js proxy server
│   ├── layout.tsx
│   ├── page.tsx                ← Server status homepage
│   └── api/summarize/
│       └── route.ts            ← POST /api/summarize (calls Claude AI)
│
├── .env.example                ← Copy to .env.local, add your API key
├── .env.local                  ← YOUR API KEY GOES HERE (never commit this)
├── next.config.js              ← CORS headers for Chrome extension
├── package.json                ← One package.json for everything
├── tsconfig.json
└── README.md
```

---

## Setup (2 steps)

### Step 1 — Start the proxy server

```bash
# In the sumly/ folder:
pnpm install
cp .env.example .env.local
# Open .env.local and set: GEMINI_API_KEY=[GCP_API_KEY]

pnpm run dev
# Server runs at http://localhost:3000
```

### Step 2 — Load the extension in Chrome

1. Open Chrome → go to `chrome://extensions/`
2. Turn on **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the **`extension/`** folder inside this project
5. Pin the extension to your toolbar

---

## How It Works

```
Click "Summarize"
      ↓
popup.js → asks content.js to extract the page text
      ↓
content.js → strips nav/ads/footers, returns clean article text
      ↓
popup.js → sends text to background.js
      ↓
background.js → checks cache (chrome.storage.local)
      ↓ (cache miss)
background.js → POST localhost:3000/api/summarize
      ↓
route.ts → calls Anthropic Claude API (key stays on server)
      ↓
Claude → returns JSON: summary, insights, topics, highlights
      ↓
result flows back → popup renders it
```

---

## Security

- Your `GEMINI_API_KEY` lives **only** in `.env.local` on your machine
- The extension never touches the Gemini API directly
- `.env.local` is git-ignored — it will never be committed

---

## Features

- Bullet-point summary (4–6 points)
- Key insights (3 deeper takeaways)
- Topic tags
- Estimated reading time
- In-page phrase highlighting (toggle on/off)
- 30-minute result cache (no repeat API calls)
- Dark / light mode toggle
- Copy summary to clipboard
- Settings panel (configure proxy URL)
