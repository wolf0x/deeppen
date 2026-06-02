import { BaseSandbox } from "deepagents";
import type { ExecuteResponse, FileUploadResponse, FileDownloadResponse } from "deepagents";
import type { ContainerManager } from "../services/ContainerManager.js";

/**
 * DockerBackend extends deepagents' BaseSandbox to delegate all operations
 * to a Docker container via ContainerManager.
 *
 * BaseSandbox provides default implementations for ls, read, write, edit,
 * grep, glob by issuing POSIX shell commands through execute(). We only
 * need to implement execute(), uploadFiles(), and downloadFiles().
 */
export class DockerBackend extends BaseSandbox {
  readonly id: string;
  private manager: ContainerManager;
  private maxOutputBytes: number;

  constructor(manager: ContainerManager, options?: { id?: string; maxOutputBytes?: number }) {
    super();
    this.manager = manager;
    this.id = options?.id ?? "docker";
    this.maxOutputBytes = options?.maxOutputBytes ?? 100_000;
  }

  /**
   * Execute a command in the Docker container.
   */
  async execute(command: string): Promise<ExecuteResponse> {
    const result = await this.manager.execute(command);
    const output = result.stdout + (result.stderr ? `\n[stderr] ${result.stderr}` : "");
    const truncated = output.length > this.maxOutputBytes;
    return {
      output: truncated ? output.slice(0, this.maxOutputBytes) : output,
      exitCode: result.exitCode,
      truncated,
    };
  }

  /**
   * Upload files to the Docker container using base64 encoding.
   */
  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = [];
    for (const [path, content] of files) {
      try {
        const b64 = Buffer.from(content).toString("base64");
        // Create parent directory, write file via base64 decode
        const dir = path.substring(0, path.lastIndexOf("/"));
        const cmd = `mkdir -p ${JSON.stringify(dir)} && echo '${b64}' | base64 -d > ${JSON.stringify(path)}`;
        const result = await this.manager.execute(cmd);
        if (result.exitCode !== 0) {
          results.push({ path, error: "permission_denied" });
        } else {
          results.push({ path, error: null });
        }
      } catch {
        results.push({ path, error: "permission_denied" });
      }
    }
    return results;
  }

  /**
   * Download files from the Docker container using base64 encoding.
   */
  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = [];
    for (const path of paths) {
      try {
        const result = await this.manager.execute(
          `test -f ${JSON.stringify(path)} && base64 ${JSON.stringify(path)} || echo "FILE_NOT_FOUND"`
        );
        if (result.exitCode !== 0 || result.stdout.trim() === "FILE_NOT_FOUND") {
          results.push({ path, content: null, error: "file_not_found" });
        } else {
          const content = Buffer.from(result.stdout.trim(), "base64");
          results.push({ path, content, error: null });
        }
      } catch {
        results.push({ path, content: null, error: "permission_denied" });
      }
    }
    return results;
  }
}
