import { spawn, type ChildProcess } from "node:child_process";
import type { McpRequest, McpResponse, McpToolDef } from "./types.js";

export interface McpClientConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpClient {
  private proc?: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, (r: McpResponse) => void>();
  private buf = "";

  constructor(private config: McpClientConfig) {}

  async start(): Promise<void> {
    this.proc = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.proc.stdout!.on("data", (d) => this.onData(d.toString()));
    await this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
  }

  private onData(s: string): void {
    this.buf += s;
    let nl;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      try {
        const res = JSON.parse(line) as McpResponse;
        const cb = this.pending.get(Number(res.id));
        if (cb) {
          this.pending.delete(Number(res.id));
          cb(res);
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const req: McpRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, (res) => {
        if (res.error) reject(new Error(res.error.message));
        else resolve(res.result);
      });
      this.proc!.stdin!.write(JSON.stringify(req) + "\n");
    });
  }

  async listTools(): Promise<McpToolDef[]> {
    const res = (await this.request("tools/list")) as { tools: McpToolDef[] };
    return res.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  async stop(): Promise<void> {
    this.proc?.kill();
  }
}
