import { NextRequest, NextResponse } from "next/server";

// Rate limiting: simple in-memory store (use Redis/Upstash for production)
const rateLimit = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 15; // requests per window

// URL-based summary cache — avoids repeat Gemini calls for the same page
const summaryCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getRateLimitKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || "localhost";
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(key);

  if (!record || now > record.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) return false;

  record.count++;
  return true;
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Extension-Version",
    },
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-Version",
  };

  try {
    // Rate limiting
    const clientKey = getRateLimitKey(req);
    if (!checkRateLimit(clientKey)) {
      return NextResponse.json(
        {
          error:
            "Rate limit exceeded. Please wait before making another request.",
        },
        { status: 429, headers: corsHeaders },
      );
    }

    // Validate API key exists
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[PageMind] GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          error:
            "Server not configured. Please set GEMINI_API_KEY in your .env.local file.",
        },
        { status: 500, headers: corsHeaders },
      );
    }

    // Parse + validate request body
    let body: {
      title?: string;
      url?: string;
      content?: string;
      wordCount?: number;
      metaDescription?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400, headers: corsHeaders },
      );
    }

    const { title, url, content, wordCount, metaDescription } = body;

    if (!content || content.trim().length < 50) {
      return NextResponse.json(
        { error: "Page content is too short or empty to summarize." },
        { status: 400, headers: corsHeaders },
      );
    }

    // Sanitize inputs (strip potential injection attempts)
    const safeTitle = String(title || "").slice(0, 500);
    const safeUrl = String(url || "").slice(0, 500);
    const safeContent = String(content).slice(0, 30000); // ~6000 words max
    const safeMeta = String(metaDescription || "").slice(0, 500);

    // Check URL cache before calling Gemini
    if (safeUrl) {
      const cached = summaryCache.get(safeUrl);
      if (cached && Date.now() < cached.expiresAt) {
        console.log("[PageMind] Cache hit for:", safeUrl);
        return NextResponse.json(
          { ...(cached.data as object), fromCache: true },
          { headers: corsHeaders },
        );
      }
    }

    // Build the prompt
    const systemPrompt = `You are an expert content analyst. Your job is to read web page content and produce structured summaries.

Always respond with ONLY valid JSON (no markdown, no preamble) in this exact format:
{
  "summary": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "insights": ["insight 1", "insight 2", "insight 3"],
  "topics": ["topic1", "topic2", "topic3", "topic4"],
  "highlights": ["key phrase from article", "another key phrase", "important concept"],
  "readingTimeMinutes": 5,
  "wordCount": 1200
}

Rules:
- summary: 4-6 concise bullet points covering the main points. Each 1-2 sentences.
- insights: 3 deeper observations, implications, or takeaways beyond surface facts.
- topics: 3-6 short topic tags (1-3 words each).
- highlights: 5-8 exact short phrases (5-15 words) from the article suitable for highlighting. Must be verbatim from the text.
- readingTimeMinutes: estimated reading time as an integer (assume 200 wpm).
- wordCount: actual word count of the analyzed content.
Return ONLY the JSON object. No markdown. No explanation.`;

    const userPrompt = `Summarize this webpage:

Title: ${safeTitle}
URL: ${safeUrl}
Meta description: ${safeMeta}

Content:
${safeContent}`;

    // Call Gemini API
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
        temperature: 0.2,
      },
    });

    let rawText: string;
    try {
      const geminiResult = await model.generateContent(userPrompt);
      rawText = geminiResult.response.text();
    } catch (apiErr: unknown) {
      const message =
        apiErr instanceof Error ? apiErr.message : "Gemini API error";
      console.error("[PageMind] Gemini API error:", message);

      // Surface quota/rate-limit errors with a friendly retry hint
      if (
        message.includes("429") ||
        message.includes("Too Many Requests") ||
        message.includes("quota")
      ) {
        // Match retryDelay field from Gemini error JSON
        const retryMatch = message.match(/"retryDelay"\s*:\s*"(\d+)s"/);
        const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;

        let retryIn: string;
        if (retrySeconds && retrySeconds <= 300) {
          retryIn = `Please retry in ${retrySeconds} seconds.`;
        } else if (message.includes("limit: 0")) {
          // Project has zero free-tier quota — billing/plan issue
          retryIn =
            "Your Gemini API free-tier quota is exhausted. Please enable billing at https://ai.dev or wait until tomorrow for the daily quota to reset.";
        } else {
          retryIn = "Please try again shortly.";
        }

        return NextResponse.json(
          { error: `Rate limit reached. ${retryIn}` },
          { status: 429, headers: corsHeaders },
        );
      }

      return NextResponse.json(
        { error: `AI service error: ${message}` },
        { status: 502, headers: corsHeaders },
      );
    }

    // Parse and validate the JSON response
    let parsed: {
      summary?: string[];
      insights?: string[];
      topics?: string[];
      highlights?: string[];
      readingTimeMinutes?: number;
      wordCount?: number;
    };

    try {
      // Strip any accidental markdown fences
      const cleaned = rawText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Sumly] Failed to parse AI response:", rawText);
      return NextResponse.json(
        { error: "AI returned an unexpected response. Please try again." },
        { status: 502, headers: corsHeaders },
      );
    }

    // Build clean response
    const result = {
      summary: Array.isArray(parsed.summary) ? parsed.summary.slice(0, 6) : [],
      insights: Array.isArray(parsed.insights)
        ? parsed.insights.slice(0, 3)
        : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 6) : [],
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.slice(0, 8)
        : [],
      readingTimeMinutes:
        typeof parsed.readingTimeMinutes === "number"
          ? Math.max(1, Math.round(parsed.readingTimeMinutes))
          : Math.max(1, Math.round((wordCount || 0) / 200)),
      wordCount:
        typeof parsed.wordCount === "number"
          ? parsed.wordCount
          : wordCount || 0,
      fromCache: false,
    };

    // Store in URL cache for 30 min to avoid redundant Gemini calls
    if (safeUrl) {
      summaryCache.set(safeUrl, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PageMind] Unhandled error:", message);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: corsHeaders },
    );
  }
}
