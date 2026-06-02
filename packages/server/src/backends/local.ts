import { BaseSandbox } from "deepagents";
import type { ExecuteResponse, FileUploadResponse, FileDownloadResponse } from "deepagents";
import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);

/**
 * LocalBackend runs commands directly on the host machine.
 * Provides access to curl, wget, ssh, and all locally installed tools
 * without requiring Docker.
 *
 * Inherits default implementations for ls, read, write, edit, grep, glob
 * from BaseSandbox (they call execute() with POSIX commands).
 */
export class LocalBackend extends BaseSandbox {
  readonly id: string;
  private maxOutputBytes: number;
  private workingDir: string;

  constructor(options?: { id?: string; maxOutputBytes?: number; workingDir?: string }) {
    super();
    this.id = options?.id ?? "local";
    this.maxOutputBytes = options?.maxOutputBytes ?? 100_000;
    this.workingDir = options?.workingDir ?? process.cwd();
  }

  /**
   * Execute a command on the local machine.
   */
  async execute(command: string): Promise<ExecuteResponse> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        timeout: 30_000, // 30s timeout per command
        maxBuffer: this.maxOutputBytes,
        env: { ...process.env, LANG: "en_US.UTF-8" },
      });
      const output = stdout + (stderr ? `\n[stderr] ${stderr}` : "");
      const truncated = output.length > this.maxOutputBytes;
      return {
        output: truncated ? output.slice(0, this.maxOutputBytes) : output,
        exitCode: 0,
        truncated,
      };
    } catch (err: any) {
      const output = (err.stdout ?? "") + (err.stderr ? `\n[stderr] ${err.stderr}` : "");
      const truncated = output.length > this.maxOutputBytes;
      return {
        output: truncated ? output.slice(0, this.maxOutputBytes) : output,
        exitCode: err.status ?? 1,
        truncated,
      };
    }
  }

  /**
   * Upload files to the local filesystem.
   */
  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = [];
    for (const [filePath, content] of files) {
      try {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content);
        results.push({ path: filePath, error: null });
      } catch {
        results.push({ path: filePath, error: "permission_denied" });
      }
    }
    return results;
  }

  /**
   * Download files from the local filesystem.
   */
  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = [];
    for (const filePath of paths) {
      try {
        const content = await fs.readFile(filePath);
        results.push({ path: filePath, content, error: null });
      } catch {
        results.push({ path: filePath, content: null, error: "file_not_found" });
      }
    }
    return results;
  }
}
