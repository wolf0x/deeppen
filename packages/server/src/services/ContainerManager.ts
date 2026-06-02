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

export class ContainerManager {
  private config: ContainerConfig = {
    image: "deeppen/tools:latest", name: "deeppen-tools",
    volumes: [], networkMode: "bridge",
    resourceLimits: { memory: "4g", cpus: 2, timeout: 60 },
    installedTools: [],
  };

  getConfig(): ContainerConfig { return { ...this.config }; }

  updateConfig(update: Partial<ContainerConfig>): void {
    Object.assign(this.config, update);
  }

  async getStatus(): Promise<ContainerStatus> {
    try {
      const { execSync } = await import("node:child_process");
      const result = execSync(`docker inspect --format='{{.State.Running}}' ${this.config.name} 2>/dev/null`, { encoding: "utf-8" }).trim();
      return { running: result === "true", name: this.config.name };
    } catch {
      return { running: false, name: this.config.name };
    }
  }

  async execute(command: string, options?: { timeout?: number; workingDir?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { execSync } = await import("node:child_process");
    const timeout = (options?.timeout ?? this.config.resourceLimits.timeout) * 1000;
    const workdir = options?.workingDir ? `-w ${options.workingDir}` : "";
    try {
      const stdout = execSync(`docker exec ${workdir} ${this.config.name} sh -c ${JSON.stringify(command)}`, { encoding: "utf-8", timeout });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? err.message, exitCode: err.status ?? 1 };
    }
  }

  async start(): Promise<void> {
    const { execSync } = await import("node:child_process");
    execSync(`docker start ${this.config.name}`, { encoding: "utf-8" });
  }

  async stop(): Promise<void> {
    const { execSync } = await import("node:child_process");
    execSync(`docker stop ${this.config.name}`, { encoding: "utf-8" });
  }
}
