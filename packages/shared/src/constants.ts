export const FLAG_PATTERNS: RegExp[] = [
  /flag\{[^}]+\}/i,
  /CTF\{[^}]+\}/i,
  /HTB\{[^}]+\}/i,
  /FLAG:\s*(\S+)/i,
  /\b[a-fA-F0-9]{32}\b/,
];

export const DEFAULT_RABBIT_HOLE = {
  maxIterations: 50,
  maxTimeMinutes: 30,
  maxSubagentDepth: 3,
  pivotStrategy: "different-approach" as const,
};

export const DEFAULT_PORT = 4000;
export const DEFAULT_CONTAINER_NAME = "deeppen-tools";
