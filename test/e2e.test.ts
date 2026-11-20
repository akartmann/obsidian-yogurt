import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import moment from "moment";
import type { Server } from "net";
import { connectSocket } from "../src/yogurt/client";
import { runSync, type VaultPort } from "../src/sync/engine";
import { DEFAULT_SETTINGS, EMPTY_STATE } from "../src/settings-data";
import { fakeYogurt, meeting } from "./fakeYogurt";

/** Socket → MCP client → engine, with only the vault faked: what the plugin does minus Obsidian. */
describe("end to end over a socket", () => {
  let server: Server;
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("syncs meetings from a Yogurt-like server into notes", async () => {
    const sock = join(mkdtempSync(join(tmpdir(), "yg-")), "mcp.sock");
    const now = Date.now();
    server = await fakeYogurt(sock, [
      meeting("x1", new Date(now - 86400000).toISOString(), { title: "Design review", summary: "## Decisions\n- ship", myNotes: "remember budget",
        attendees: [{ name: "Ana Lima", email: "ana@x.io" }, { name: "Me", email: "me@x.io" }] }),
      meeting("x2", new Date(now - 3600000).toISOString(), { recording: true }),
      meeting("old", new Date(now - 90 * 86400000).toISOString()),
    ]);
    const files = new Map<string, string>();
    const fm = new Map<string, Record<string, unknown>>();
    const port: VaultPort = {
      findByYogurtId: (id) => [...fm].find(([, f]) => f["yogurt-id"] === id)?.[0] ?? null,
      exists: (p) => files.has(p), ensureFolder: async () => {}, create: async (p, c) => void files.set(p, c),
      read: async (p) => files.get(p)!, process: async (p, fn) => void files.set(p, fn(files.get(p)!)),
      setFrontmatter: async (p, o, t) => void fm.set(p, { ...o, tags: t }), readTemplate: async () => null,
    };
    const conn = await connectSocket(sock);
    const { result } = await runSync({
      conn, port, settings: { ...DEFAULT_SETTINGS, excludeSelf: "me@x.io" }, state: EMPTY_STATE,
      format: (iso, f) => moment(iso).format(f), hooks: { attendeeLink: async (a) => `[[${a.name}]]` },
    });
    conn.close();
    expect(result).toMatchObject({ created: 1, skipped: 1, errors: [] });
    const [path, body] = [...files][0];
    expect(path).toMatch(/^Meetings\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2} Design review\.md$/);
    expect(body).toContain("## Summary\n\n## Decisions\n- ship\n\n## My notes\n\nremember budget");
    expect(fm.get(path)).toMatchObject({ "yogurt-id": "x1", attendees: ["[[Ana Lima]]"], app: "Zoom", tags: ["meeting"] });
  });
});
