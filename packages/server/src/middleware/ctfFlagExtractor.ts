import { createMiddleware } from "langchain";
import { FLAG_PATTERNS } from "@deeppen/shared";

/**
 * Collect all matches of a pattern against text, regardless of whether
 * the pattern itself carries the `g` flag.
 */
function matchAll(text: string, pattern: RegExp): string[] {
  const re = pattern.flags.includes("g")
    ? pattern
    : new RegExp(pattern.source, pattern.flags + "g");
  return text.match(re) ?? [];
}

/**
 * Extract all flag-like strings from text using configured patterns.
 * Deduplicates results.
 */
export function extractFlags(text: string): string[] {
  if (!text) return [];
  const flags: string[] = [];
  for (const pattern of FLAG_PATTERNS) {
    for (const match of matchAll(text, pattern)) {
      if (!flags.includes(match)) {
        flags.push(match);
      }
    }
  }
  return flags;
}

export interface FlagExtractorOptions {
  /** Callback when a flag is found */
  onFlagFound?: (flag: string, source: string) => void;
  /** Additional regex patterns to check beyond the defaults */
  customPatterns?: RegExp[];
}

/**
 * Deepagentsjs middleware that scans every model response for CTF flags.
 *
 * Uses wrapModelCall to intercept the response after the model generates it.
 * When flags are found, calls onFlagFound callback with each flag.
 */
export function createFlagExtractorMiddleware(options: FlagExtractorOptions = {}) {
  const { onFlagFound, customPatterns = [] } = options;
  const allPatterns = [...FLAG_PATTERNS, ...customPatterns];

  function scanForFlags(text: string): string[] {
    if (!text) return [];
    const flags: string[] = [];
    for (const pattern of allPatterns) {
      for (const match of matchAll(text, pattern)) {
        if (!flags.includes(match)) {
          flags.push(match);
        }
      }
    }
    return flags;
  }

  return createMiddleware({
    name: "CtfFlagExtractor",
    wrapModelCall: async (request, handler) => {
      const response = await handler(request);

      // Extract text content from response
      const content = typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((b: any) => ("text" in b ? b.text : ""))
              .join("")
          : "";

      // Scan for flags
      const flags = scanForFlags(content);
      for (const flag of flags) {
        onFlagFound?.(flag, "model-response");
      }

      return response;
    },
  });
}
