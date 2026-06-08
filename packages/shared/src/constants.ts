export const FLAG_PATTERNS: RegExp[] = [
  /flag\{[^}]+\}/i,
  /CTF\{[^}]+\}/i,
  /HTB\{[^}]+\}/i,
  /WIZ_CTF_[a-zA-Z0-9_]+/i,
  /juice-shop\{[^}]+\}/i,
];

/**
 * Validate that a string looks like a real CTF flag, not random hex/code.
 */
export function isValidFlag(flag: string): boolean {
  if (!flag || flag.length < 8) return false;
  // Explicit flag formats
  if (/^(flag|CTF|HTB|WIZ_CTF_|juice-shop)\{/.test(flag)) return true;
  if (/^WIZ_CTF_/.test(flag)) return true;
  // Reject anything that looks like code
  if (/[{}();=<>!]/.test(flag)) return false;
  // Pure 32-char hex (MD5) — only if it looks like a hash
  if (/^[a-fA-F0-9]{32}$/.test(flag)) return true;
  return false;
}

export const DEFAULT_RABBIT_HOLE = {
  maxIterations: 50,
  maxTimeMinutes: 30,
  maxSubagentDepth: 3,
  pivotStrategy: "different-approach" as const,
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_CONTAINER_NAME = "deeppen-tools";
