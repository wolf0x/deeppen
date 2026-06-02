import { describe, it, expect, vi } from "vitest";

vi.mock("deepagents", () => ({
  createMiddleware: (opts: any) => ({ ...opts }),
}));

const { extractFlags, createFlagExtractorMiddleware } = await import("./ctfFlagExtractor.js");

describe("extractFlags", () => {
  it("extracts flag{...} pattern", () => {
    const result = extractFlags("The answer is flag{sql_1nj3ction_ftw}");
    expect(result).toEqual(["flag{sql_1nj3ction_ftw}"]);
  });

  it("extracts CTF{...} pattern", () => {
    const result = extractFlags("Found CTF{test123}");
    expect(result).toEqual(["CTF{test123}"]);
  });

  it("extracts HTB{...} pattern", () => {
    const result = extractFlags("Got HTB{my_flag}");
    expect(result).toEqual(["HTB{my_flag}"]);
  });

  it("extracts FLAG: pattern", () => {
    const result = extractFlags("FLAG: abcdef123456");
    expect(result).toEqual(["FLAG: abcdef123456"]);
  });

  it("extracts multiple flags", () => {
    const result = extractFlags("flag{one} and flag{two}");
    expect(result).toEqual(["flag{one}", "flag{two}"]);
  });

  it("returns empty array for no flags", () => {
    const result = extractFlags("No flags here");
    expect(result).toEqual([]);
  });

  it("handles empty string", () => {
    const result = extractFlags("");
    expect(result).toEqual([]);
  });

  it("deduplicates identical flags", () => {
    const result = extractFlags("flag{same} and flag{same}");
    expect(result).toEqual(["flag{same}"]);
  });
});

describe("createFlagExtractorMiddleware", () => {
  it("creates middleware with correct name", () => {
    const mw = createFlagExtractorMiddleware();
    expect(mw.name).toBe("CtfFlagExtractor");
  });

  it("accepts custom patterns", () => {
    const custom = [/CUSTOM\{[^}]+\}/];
    const mw = createFlagExtractorMiddleware({ customPatterns: custom });
    expect(mw).toBeDefined();
  });
});
