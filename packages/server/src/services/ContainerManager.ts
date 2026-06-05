import { execFileSync } from "node:child_process";

export interface ContainerConfig {
  image: string;
  name: string;
  volumes: Array<{ host: string; container: string }>;
  networkMode: string;
  resourceLimits: { memory: string; cpus: number; timeout: number };
  installedTools: string[];
}

export interface ContainerStatus {
  running: boolean;
  id?: string;
  name?: string;
  uptime?: string;
}

function isValidContainerName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name);
}

export class ContainerManager {
  private config: ContainerConfig = {
    image: "kalilinux/kali-rolling", name: "pentest-lab",
    volumes: [], networkMode: "bridge",
    resourceLimits: { memory: "4g", cpus: 2, timeout: 60 },
    installedTools: [],
  };

  getConfig(): ContainerConfig { return { ...this.config }; }

  updateConfig(update: Partial<ContainerConfig>): void {
    if (update.name !== undefined && !isValidContainerName(update.name)) {
      throw new Error("Invalid container name: must be alphanumeric with hyphens/underscores");
    }
    Object.assign(this.config, update);
  }

  async getStatus(): Promise<ContainerStatus> {
    if (!isValidContainerName(this.config.name)) {
      return { running: false, name: this.config.name };
    }
    try {
      const result = execFileSync("docker", [
        "inspect", "--format={{.State.Running}}", this.config.name,
      ], { encoding: "utf-8", timeout: 5000 }).trim();
      return { running: result === "true", name: this.config.name };
    } catch {
      return { running: false, name: this.config.name };
    }
  }

  async execute(command: string, options?: { timeout?: number; workingDir?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!isValidContainerName(this.config.name)) {
      return { stdout: "", stderr: "Invalid container name", exitCode: 1 };
    }
    const timeout = (options?.timeout ?? this.config.resourceLimits.timeout) * 1000;
    const args = ["exec"];
    if (options?.workingDir) {
      args.push("-w", options.workingDir);
    }
    args.push(this.config.name, "sh", "-c", command);
    try {
      const stdout = execFileSync("docker", args, { encoding: "utf-8", timeout });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? err.message, exitCode: err.status ?? 1 };
    }
  }

  async start(): Promise<void> {
    if (!isValidContainerName(this.config.name)) throw new Error("Invalid container name");
    execFileSync("docker", ["start", this.config.name], { encoding: "utf-8" });
  }

  async stop(): Promise<void> {
    if (!isValidContainerName(this.config.name)) throw new Error("Invalid container name");
    execFileSync("docker", ["stop", this.config.name], { encoding: "utf-8" });
  }
}
