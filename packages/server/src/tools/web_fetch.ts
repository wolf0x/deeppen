import { tool } from "langchain";
import { z } from "zod";

/**
 * Web fetch tool that fetches a URL and returns the content.
 * Uses Node's native fetch API.
 */
export function createWebFetchTool() {
  return tool(
    async (input: { url: string; extract_text?: boolean }): Promise<string> => {
      let { url, extract_text = true } = input;

      try {
        // Auto-prepend https:// if no protocol given
        if (!url.match(/^https?:\/\//)) {
          url = "https://" + url;
        }

        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return "Error: Only HTTP and HTTPS URLs are supported";
        }

        const response = await fetch(url, {
          headers: {
            "User-Agent": "DeepPen/1.0 (CTF Challenge Solver)",
          },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });

        if (!response.ok) {
          return `Error: HTTP ${response.status} ${response.statusText}`;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();

        if (!extract_text) {
          return text.slice(0, 50000);
        }

        // For HTML, do basic text extraction
        if (contentType.includes("text/html")) {
          let cleaned = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();
          return cleaned.slice(0, 50000);
        }

        return text.slice(0, 50000);
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          return `Error: Request timed out after 30s fetching ${url}`;
        }
        return `Error fetching ${url}: ${err.message}`;
      }
    },
    {
      name: "web_fetch",
      description:
        "Fetch a URL and return its content. Use this to retrieve web pages, API responses, or any HTTP resource. URLs without a protocol (e.g. 'example.com') are treated as HTTPS. Supports HTML (auto-extracts text), JSON, plain text. Max 50KB.",
      schema: z.object({
        url: z.string().describe("The URL to fetch (e.g. 'https://example.com' or 'example.com')"),
        extract_text: z
          .boolean()
          .default(true)
          .describe(
            "If true, extract text from HTML. If false, return raw content."
          ),
      }),
    }
  );
}
