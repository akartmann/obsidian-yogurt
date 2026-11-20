/**
 * JSON-RPC 2.0 over newline-delimited JSON: MCP's stdio framing, which Yogurt also uses on its socket.
 * Works over anything with write() and data/close events (a net.Socket, or a child process's stdin/stdout).
 */
export interface LineOut { write(chunk: string): unknown }
export interface LineIn {
  on(event: "data", cb: (chunk: Buffer | string) => void): unknown;
  on(event: "close" | "end", cb: () => void): unknown;
  on(event: "error", cb: (e: Error) => void): unknown;
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: number) { super(message); }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class LineRpc {
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closed: Error | null = null;

  constructor(private out: LineOut, input: LineIn, private timeoutMs = 20000) {
    input.on("data", (c) => this.onData(typeof c === "string" ? c : c.toString("utf8")));
    const gone = (e?: Error) => this.failAll(e ?? new RpcError("Connection closed"));
    input.on("close", () => gone());
    input.on("end", () => gone());
    input.on("error", (e) => gone(e));
  }

  request<T = unknown>(method: string, params?: object): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(`Timed out waiting for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.out.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
    });
  }

  notify(method: string, params?: object): void {
    if (!this.closed) this.out.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n");
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg: { id?: unknown; result?: unknown; error?: { code?: number; message?: string } };
      try { msg = JSON.parse(line); } catch { continue; }
      if (typeof msg.id !== "number") continue;
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new RpcError(msg.error.message ?? "Error", msg.error.code));
      else p.resolve(msg.result);
    }
  }

  private failAll(e: Error) {
    if (this.closed) return;
    this.closed = e;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(e); }
    this.pending.clear();
  }
}
