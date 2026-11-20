import { spawn } from "child_process";
import { createConnection, type Socket } from "net";
import type { MeetingDetail, MeetingSummary } from "../types";
import { LineRpc } from "./rpc";

export type YogurtErrorKind = "not-running" | "disabled" | "failed";

export class YogurtError extends Error {
  constructor(readonly kind: YogurtErrorKind, message: string) { super(message); }
}

export interface YogurtConnection {
  listMeetings(opts: { before?: string; limit?: number }): Promise<MeetingSummary[]>;
  getMeeting(id: string): Promise<MeetingDetail>;
  close(): void;
}

const CLIENT_INFO = { name: "Obsidian Yogurt Sync", version: "0.1.0" };

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

async function open(rpc: LineRpc, close: () => void): Promise<YogurtConnection> {
  try {
    await rpc.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: CLIENT_INFO });
  } catch (e) {
    close();
    throw new YogurtError("not-running", `Yogurt didn't answer: ${(e as Error).message}`);
  }
  rpc.notify("notifications/initialized");

  const call = async <T>(name: string, args: object): Promise<T> => {
    let res: ToolResult;
    try { res = await rpc.request<ToolResult>("tools/call", { name, arguments: args }); } catch (e) {
      throw new YogurtError("failed", (e as Error).message);
    }
    const text = res?.content?.find((c) => c.type === "text")?.text ?? "";
    if (res?.isError) {
      throw new YogurtError(/turned off|turn it on/i.test(text) ? "disabled" : "failed", text || `${name} failed`);
    }
    try { return JSON.parse(text) as T; } catch { throw new YogurtError("failed", `Unexpected answer from ${name}`); }
  };

  return {
    listMeetings: ({ before, limit = 100 }) => call<MeetingSummary[]>("list_meetings", { limit, ...(before ? { before } : {}) }),
    getMeeting: (id) => call<MeetingDetail>("get_meeting", { id }),
    close,
  };
}

/** Default: Yogurt's own socket (Mac/Linux) or named pipe (Windows). Fails with not-running when Yogurt is closed. */
export function connectSocket(address: string, timeoutMs = 20000): Promise<YogurtConnection> {
  return new Promise((resolve, reject) => {
    let sock: Socket;
    const onError = (e: NodeJS.ErrnoException) => {
      reject(new YogurtError("not-running", e.code === "ENOENT" || e.code === "ECONNREFUSED"
        ? "Yogurt isn't running." : `Couldn't reach Yogurt: ${e.message}`));
    };
    sock = createConnection(address, () => {
      sock.off("error", onError);
      sock.on("error", () => { /* surfaced through LineRpc */ });
      const rpc = new LineRpc(sock, sock, timeoutMs);
      open(rpc, () => sock.destroy()).then(resolve, reject);
    });
    sock.setEncoding("utf8");
    sock.once("error", onError);
  });
}

/** Advanced: the yogurt-mcp helper as a stdio MCP server; it starts Yogurt in the background when needed. */
export function connectHelper(command: string, timeoutMs = 60000): Promise<YogurtConnection> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    child.once("error", (e) => reject(new YogurtError("not-running", `Couldn't start the Yogurt helper: ${e.message}`)));
    child.stdout.setEncoding("utf8");
    const rpc = new LineRpc(child.stdin, child.stdout, timeoutMs);
    open(rpc, () => child.kill()).then(resolve, reject);
  });
}
