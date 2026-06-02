import { tool } from "langchain";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// NOTE: No createShellTool() here — BaseSandbox already provides a built-in
// 'execute' tool that delegates to LocalBackend.execute(). Adding a custom
// tool with the same name causes a conflict.

/**
 * Dedicated curl tool for HTTP requests.
 */
export function createCurlTool() {
  return tool(
    async ({ url, method, headers, body, followRedirects }: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      followRedirects?: boolean;
    }) => {
      const parts = ["curl", "-s", "-S"];
      if (followRedirects !== false) parts.push("-L");
      parts.push("-o", "-"); // output to stdout
      parts.push("-w", "\n%{http_code} %{size_download} %{time_total}s");
      if (method && method !== "GET") parts.push("-X", method);
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          parts.push("-H", `${k}: ${v}`);
        }
      }
      if (body) parts.push("-d", body);
      parts.push("--max-time", "15");
      parts.push(url);

      try {
        const { stdout, stderr } = await execAsync(parts.map(p => JSON.stringify(p)).join(" "), {
          timeout: 20_000,
          maxBuffer: 100_000,
        });
        const output = stdout.length > 10_000 ? stdout.slice(0, 10_000) + "\n... (truncated)" : stdout;
        return output + (stderr ? `\n[stderr] ${stderr}` : "");
      } catch (err: any) {
        return `curl error (exit ${err.status ?? 1}): ${err.stderr || err.message}`;
      }
    },
    {
      name: "curl",
      description: "Make HTTP requests using curl. Supports GET, POST, PUT, custom headers, request body, and automatic redirect following. Returns the response body and status info.",
      schema: z.object({
        url: z.string().describe("The URL to request"),
        method: z.string().optional().describe("HTTP method (GET, POST, PUT, DELETE, etc.)"),
        headers: z.record(z.string()).optional().describe("HTTP headers as key-value pairs"),
        body: z.string().optional().describe("Request body (for POST/PUT)"),
        followRedirects: z.boolean().optional().describe("Follow HTTP redirects (default: true)"),
      }),
    }
  );
}

/**
 * Dedicated wget tool for downloading files.
 */
export function createWgetTool() {
  return tool(
    async ({ url, output, timeout }: { url: string; output?: string; timeout?: number }) => {
      const parts = ["wget", "-q"];
      if (output) parts.push("-O", output);
      else parts.push("-O", "-"); // stdout
      parts.push("--timeout", String((timeout ?? 15) / 1000));
      parts.push(url);

      try {
        const { stdout, stderr } = await execAsync(parts.map(p => JSON.stringify(p)).join(" "), {
          timeout: (timeout ?? 15) + 5000,
          maxBuffer: 100_000,
        });
        if (output) return `Downloaded to ${output}`;
        const result = stdout.length > 10_000 ? stdout.slice(0, 10_000) + "\n... (truncated)" : stdout;
        return result || "(no output)";
      } catch (err: any) {
        return `wget error (exit ${err.status ?? 1}): ${err.stderr || err.message}`;
      }
    },
    {
      name: "wget",
      description: "Download files from a URL using wget. Can save to a file or output to stdout.",
      schema: z.object({
        url: z.string().describe("The URL to download from"),
        output: z.string().optional().describe("Local file path to save to (omit to print to stdout)"),
        timeout: z.number().optional().describe("Timeout in milliseconds (default: 15000)"),
      }),
    }
  );
}

/**
 * SSH/SCP tool for remote connections.
 */
export function createSshTool() {
  return tool(
    async ({ host, command, user, port, key }: {
      host: string;
      command?: string;
      user?: string;
      port?: number;
      key?: string;
    }) => {
      const parts = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10"];
      if (port) parts.push("-p", String(port));
      if (key) parts.push("-i", key);
      const target = user ? `${user}@${host}` : host;
      parts.push(target);
      if (command) parts.push(command);

      try {
        const { stdout, stderr } = await execAsync(parts.map(p => JSON.stringify(p)).join(" "), {
          timeout: 30_000,
          maxBuffer: 100_000,
        });
        const output = stdout + (stderr ? `\n[stderr] ${stderr}` : "");
        return output.length > 10_000 ? output.slice(0, 10_000) + "\n... (truncated)" : output || "(no output)";
      } catch (err: any) {
        return `ssh error (exit ${err.status ?? 1}): ${err.stderr || err.message}`;
      }
    },
    {
      name: "ssh",
      description: "Connect to a remote host via SSH. Can run a single command or check connectivity. Supports custom user, port, and SSH key.",
      schema: z.object({
        host: z.string().describe("Remote host (IP or hostname)"),
        command: z.string().optional().describe("Command to execute on the remote host"),
        user: z.string().optional().describe("SSH username"),
        port: z.number().optional().describe("SSH port (default: 22)"),
        key: z.string().optional().describe("Path to SSH private key file"),
      }),
    }
  );
}

/**
 * Netcat tool for TCP/UDP connections and port testing.
 */
export function createNetcatTool() {
  return tool(
    async ({ host, port, data, timeout, udp }: {
      host: string;
      port: number;
      data?: string;
      timeout?: number;
      udp?: boolean;
    }) => {
      const parts = ["nc"];
      if (udp) parts.push("-u");
      parts.push("-w", String((timeout ?? 5)));
      parts.push(host, String(port));

      try {
        let cmd = parts.map(p => JSON.stringify(p)).join(" ");
        if (data) {
          cmd = `echo ${JSON.stringify(data)} | ${cmd}`;
        }
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: ((timeout ?? 5) + 2) * 1000,
          maxBuffer: 50_000,
        });
        const output = stdout + (stderr ? `\n[stderr] ${stderr}` : "");
        return output.length > 5_000 ? output.slice(0, 5_000) + "\n... (truncated)" : output || "(connection opened, no data received)";
      } catch (err: any) {
        return `nc error (exit ${err.status ?? 1}): ${err.stderr || err.message}`;
      }
    },
    {
      name: "netcat",
      description: "Connect to TCP/UDP ports using netcat (nc). Useful for port testing, banner grabbing, and simple protocol interactions.",
      schema: z.object({
        host: z.string().describe("Target host"),
        port: z.number().describe("Target port"),
        data: z.string().optional().describe("Data to send after connecting"),
        timeout: z.number().optional().describe("Connection timeout in seconds (default: 5)"),
        udp: z.boolean().optional().describe("Use UDP instead of TCP"),
      }),
    }
  );
}

/**
 * Get all default shell tools.
 * Note: 'execute' is provided by BaseSandbox/LocalBackend automatically.
 */
export function getDefaultShellTools() {
  return [
    createCurlTool(),
    createWgetTool(),
    createSshTool(),
    createNetcatTool(),
  ];
}
