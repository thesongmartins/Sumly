import { z } from "zod";

export const summarizeRequestSchema = z.object({
  title: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  content: z
    .string()
    .max(500_000, "Page content is too large.")
    .refine(
      (s) => s.trim().length >= 50,
      "Page content is too short or empty to summarize.",
    ),
  wordCount: z.number().int().nonnegative().max(10_000_000).optional(),
  metaDescription: z.string().max(1000).optional(),
});

export type SummarizeRequest = z.infer<typeof summarizeRequestSchema>;

export interface SummaryResult {
  summary: string[];
  insights: string[];
  topics: string[];
  highlights: string[];
  readingTimeMinutes: number;
  wordCount: number;
  fromCache: boolean;
}
