import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { corsHeaders, isAuthorized, withTimeout, TimeoutError } from "@/lib/http";
import { MemoryRateLimiter, MemoryCache } from "@/lib/store";
import { summarizeRequestSchema, type SummaryResult } from "@/lib/validation";

// Swap these for a durable backend (e.g. Upstash) on multi-instance deployments.
const rateLimiter = new MemoryRateLimiter(
  config.rateLimit.windowMs,
  config.rateLimit.max,
);
const summaryCache = new MemoryCache<SummaryResult>(config.cache.ttlMs);

function clientKey(req: NextRequest): string {
  // x-forwarded-for may be a comma list — the first entry is the client IP.
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "localhost";
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: cors },
      );
    }

    if (!rateLimiter.check(clientKey(req))) {
      return NextResponse.json(
        {
          error:
            "Rate limit exceeded. Please wait before making another request.",
        },
        { status: 429, headers: cors },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error("GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          error:
            "Server not configured. Please set GEMINI_API_KEY in your .env.local file.",
        },
        { status: 500, headers: cors },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400, headers: cors },
      );
    }

    const parsed = summarizeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request." },
        { status: 400, headers: cors },
      );
    }

    const { title, url, content, wordCount, metaDescription } = parsed.data;

    const safeTitle = (title || "").slice(0, 500);
    const safeUrl = (url || "").slice(0, 500);
    const safeContent = content.slice(0, config.gemini.maxContentChars);
    const safeMeta = (metaDescription || "").slice(0, 500);

    if (safeUrl) {
      const cached = summaryCache.get(safeUrl);
      if (cached) {
        logger.debug("cache hit", { url: safeUrl });
        return NextResponse.json(
          { ...cached, fromCache: true },
          { headers: cors },
        );
      }
    }

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

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: config.gemini.maxOutputTokens,
        temperature: config.gemini.temperature,
      },
    });

    let rawText: string;
    try {
      const geminiResult = await withTimeout(
        model.generateContent(userPrompt),
        config.gemini.timeoutMs,
      );
      rawText = geminiResult.response.text();
    } catch (apiErr: unknown) {
      if (apiErr instanceof TimeoutError) {
        logger.warn("gemini timeout", { ms: config.gemini.timeoutMs });
        return NextResponse.json(
          { error: "The AI service took too long to respond. Please try again." },
          { status: 504, headers: cors },
        );
      }

      const message =
        apiErr instanceof Error ? apiErr.message : "Gemini API error";
      logger.error("gemini api error", { message });

      if (
        message.includes("429") ||
        message.includes("Too Many Requests") ||
        message.includes("quota")
      ) {
        const retryMatch = message.match(/"retryDelay"\s*:\s*"(\d+)s"/);
        const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;

        let retryIn: string;
        if (retrySeconds && retrySeconds <= 300) {
          retryIn = `Please retry in ${retrySeconds} seconds.`;
        } else if (message.includes("limit: 0")) {
          retryIn =
            "Your Gemini API free-tier quota is exhausted. Please enable billing at https://ai.dev or wait until tomorrow for the daily quota to reset.";
        } else {
          retryIn = "Please try again shortly.";
        }

        return NextResponse.json(
          { error: `Rate limit reached. ${retryIn}` },
          { status: 429, headers: cors },
        );
      }

      return NextResponse.json(
        { error: `AI service error: ${message}` },
        { status: 502, headers: cors },
      );
    }

    let parsedAI: {
      summary?: string[];
      insights?: string[];
      topics?: string[];
      highlights?: string[];
      readingTimeMinutes?: number;
      wordCount?: number;
    };

    try {
      const cleaned = rawText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      parsedAI = JSON.parse(cleaned);
    } catch {
      logger.error("failed to parse AI response", { rawText });
      return NextResponse.json(
        { error: "AI returned an unexpected response. Please try again." },
        { status: 502, headers: cors },
      );
    }

    const result: SummaryResult = {
      summary: Array.isArray(parsedAI.summary)
        ? parsedAI.summary.slice(0, 6)
        : [],
      insights: Array.isArray(parsedAI.insights)
        ? parsedAI.insights.slice(0, 3)
        : [],
      topics: Array.isArray(parsedAI.topics) ? parsedAI.topics.slice(0, 6) : [],
      highlights: Array.isArray(parsedAI.highlights)
        ? parsedAI.highlights.slice(0, 8)
        : [],
      readingTimeMinutes:
        typeof parsedAI.readingTimeMinutes === "number"
          ? Math.max(1, Math.round(parsedAI.readingTimeMinutes))
          : Math.max(1, Math.round((wordCount || 0) / 200)),
      wordCount:
        typeof parsedAI.wordCount === "number"
          ? parsedAI.wordCount
          : wordCount || 0,
      fromCache: false,
    };

    if (safeUrl) summaryCache.set(safeUrl, result);

    return NextResponse.json(result, { headers: cors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("unhandled error", { message });
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500, headers: cors },
    );
  }
}
