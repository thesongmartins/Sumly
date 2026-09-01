import { NextRequest } from "next/server";

// Controllable mock for the dynamically-imported Gemini client.
// The variable name must start with "mock" to satisfy jest.mock hoisting rules.
const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}));

// Import AFTER the mock is registered.
import { POST } from "./route";

let ipCounter = 0;
// Unique IP per test so the module-level rate-limit Map doesn't bleed across tests.
function freshIp(): string {
  ipCounter += 1;
  return `10.0.${ipCounter}.1`;
}

let urlCounter = 0;
// Unique URL per test so the module-level summary cache doesn't cause stray hits.
function freshUrl(): string {
  urlCounter += 1;
  return `https://example.com/article-${urlCounter}`;
}

function makeReq(
  body: unknown,
  { ip = freshIp() }: { ip?: string } = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/summarize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// A body long enough to pass the >= 50 char content guard.
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Article",
    url: freshUrl(),
    content: "x".repeat(200),
    wordCount: 1200,
    metaDescription: "A test page",
    ...overrides,
  };
}

// Make the mocked Gemini call resolve with a given raw text payload.
function geminiReturns(text: string) {
  mockGenerateContent.mockResolvedValue({ response: { text: () => text } });
}

const GOOD_JSON = JSON.stringify({
  summary: ["a", "b", "c", "d"],
  insights: ["i1", "i2", "i3"],
  topics: ["t1", "t2"],
  highlights: ["h1", "h2"],
  readingTimeMinutes: 6,
  wordCount: 1200,
});

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe("POST /api/summarize — validation", () => {
  it("returns 400 for an unparseable JSON body", async () => {
    const res = await POST(makeReq("this is not json{"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid request body/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns 400 when content is too short", async () => {
    const res = await POST(makeReq(validBody({ content: "short" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too short or empty/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns 500 when the API key is not configured", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await POST(makeReq(validBody()));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/not configured/i);
    } finally {
      process.env.GEMINI_API_KEY = original;
    }
  });
});

describe("POST /api/summarize — rate limiting", () => {
  it("blocks the 16th request from the same IP within the window", async () => {
    geminiReturns(GOOD_JSON);
    const ip = freshIp();

    for (let i = 0; i < 15; i++) {
      const ok = await POST(makeReq(validBody(), { ip }));
      expect(ok.status).toBe(200);
    }

    const blocked = await POST(makeReq(validBody(), { ip }));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Rate limit exceeded/i);
  });
});

describe("POST /api/summarize — success + shaping", () => {
  it("returns a normalized summary and caps array lengths", async () => {
    geminiReturns(
      JSON.stringify({
        summary: ["1", "2", "3", "4", "5", "6", "7", "8"],
        insights: ["a", "b", "c", "d", "e"],
        topics: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
        highlights: Array.from({ length: 12 }, (_, i) => `h${i}`),
        readingTimeMinutes: 4.6,
        wordCount: 999,
      }),
    );

    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.summary).toHaveLength(6);
    expect(json.insights).toHaveLength(3);
    expect(json.topics).toHaveLength(6);
    expect(json.highlights).toHaveLength(8);
    expect(json.readingTimeMinutes).toBe(5); // rounded from 4.6
    expect(json.wordCount).toBe(999);
    expect(json.fromCache).toBe(false);
  });

  it("strips accidental markdown fences before parsing", async () => {
    geminiReturns("```json\n" + GOOD_JSON + "\n```");
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to wordCount-based reading time when the model omits it", async () => {
    geminiReturns(
      JSON.stringify({ summary: ["a"], insights: [], topics: [], highlights: [] }),
    );
    const res = await POST(makeReq(validBody({ wordCount: 400 })));
    const json = await res.json();
    expect(json.readingTimeMinutes).toBe(2); // 400 / 200
  });
});

describe("POST /api/summarize — caching", () => {
  it("serves the second request for the same URL from cache without calling Gemini", async () => {
    geminiReturns(GOOD_JSON);
    const ip = freshIp();
    const url = freshUrl();

    const first = await POST(makeReq(validBody({ url }), { ip }));
    expect((await first.json()).fromCache).toBe(false);

    const second = await POST(makeReq(validBody({ url }), { ip }));
    expect((await second.json()).fromCache).toBe(true);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/summarize — error mapping", () => {
  it("maps a Gemini 429 with retryDelay to a friendly retry hint", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('[429 Too Many Requests] quota exceeded {"retryDelay":"12s"}'),
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/retry in 12 seconds/i);
  });

  it("maps a zero free-tier quota (limit: 0) to a billing hint", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error("[429 Too Many Requests] quota limit: 0 for the day"),
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/free-tier quota is exhausted/i);
  });

  it("returns 502 when the model returns non-JSON", async () => {
    geminiReturns("I'm sorry, I cannot do that.");
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/unexpected response/i);
  });

  it("returns 502 for a generic upstream error", async () => {
    mockGenerateContent.mockRejectedValue(new Error("network down"));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/AI service error/i);
  });

  it("returns 504 when the model exceeds the timeout", async () => {
    const original = process.env.GEMINI_TIMEOUT_MS;
    process.env.GEMINI_TIMEOUT_MS = "30";
    mockGenerateContent.mockReturnValue(
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ response: { text: () => GOOD_JSON } }),
          300,
        ),
      ),
    );
    try {
      const res = await POST(makeReq(validBody()));
      expect(res.status).toBe(504);
      expect((await res.json()).error).toMatch(/took too long/i);
    } finally {
      process.env.GEMINI_TIMEOUT_MS = original;
    }
  });
});

describe("POST /api/summarize — shared-secret auth", () => {
  it("returns 401 when a secret is configured but the header is missing", async () => {
    const original = process.env.EXTENSION_SHARED_SECRET;
    process.env.EXTENSION_SHARED_SECRET = "s3cret";
    try {
      geminiReturns(GOOD_JSON);
      const res = await POST(makeReq(validBody()));
      expect(res.status).toBe(401);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    } finally {
      process.env.EXTENSION_SHARED_SECRET = original;
    }
  });

  it("allows the request when the secret header matches", async () => {
    const original = process.env.EXTENSION_SHARED_SECRET;
    process.env.EXTENSION_SHARED_SECRET = "s3cret";
    try {
      geminiReturns(GOOD_JSON);
      const req = new NextRequest("http://localhost:3000/api/summarize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": freshIp(),
          "x-extension-secret": "s3cret",
        },
        body: JSON.stringify(validBody()),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    } finally {
      process.env.EXTENSION_SHARED_SECRET = original;
    }
  });
});
