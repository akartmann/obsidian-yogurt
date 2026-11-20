import { createServer, type Server } from "net";
import type { MeetingDetail } from "../src/types";

/** A stand-in for Yogurt's MCP socket with the same tool answers (app/src/main/mcp/server.ts). */
export function fakeYogurt(path: string, meetings: MeetingDetail[], opts: { enabled?: boolean } = {}): Promise<Server> {
  const enabled = opts.enabled ?? true;
  const said = (id: unknown, text: string, isError = false) => ({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], ...(isError ? { isError } : {}) } });
  const server = createServer((sock) => {
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (c: string) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (msg.id === undefined) continue;
        let reply: object;
        if (msg.method === "initialize") reply = { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "yogurt" } } };
        else if (msg.method === "tools/call") {
          const { name, arguments: a } = msg.params;
          if (!enabled) reply = said(msg.id, "Yogurt has connecting AI apps turned off. The person can turn it on in Yogurt: Settings, AI apps.", true);
          else if (name === "list_meetings") {
            const before = a.before ? Date.parse(a.before) : Infinity;
            const limit = Math.min(100, a.limit ?? 20);
            const list = [...meetings].sort((x, y) => Date.parse(y.start!) - Date.parse(x.start!))
              .filter((m) => Date.parse(m.start!) < before).slice(0, limit)
              .map(({ calendar_event, myNotes, summary, ...rest }) => rest);
            reply = said(msg.id, JSON.stringify(list));
          } else if (name === "get_meeting") {
            const m = meetings.find((x) => x.id === a.id);
            reply = m ? said(msg.id, JSON.stringify(m)) : said(msg.id, `No meeting with id "${a.id}".`, true);
          } else reply = said(msg.id, `Yogurt has no tool called ${name}.`, true);
        } else reply = { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "nope" } };
        sock.write(JSON.stringify(reply) + "\n");
      }
    });
  });
  return new Promise((r) => server.listen(path, () => r(server)));
}

export const meeting = (id: string, start: string, extra: Partial<MeetingDetail> = {}): MeetingDetail => ({
  id, title: `Meeting ${id}`, start, end: new Date(Date.parse(start) + 30 * 60000).toISOString(),
  people: ["Ana"], attendees: [{ name: "Ana", email: "ana@x.io" }], app: "Zoom", recording: false,
  calendar_event: null, myNotes: "", summary: `Summary of ${id}`, ...extra,
});
