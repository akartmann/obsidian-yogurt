import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Server } from "net";
import { connectSocket, YogurtError } from "../src/yogurt/client";
import { fakeYogurt, meeting } from "./fakeYogurt";

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));
const sockPath = () => join(mkdtempSync(join(tmpdir(), "yg-")), "mcp.sock");

describe("yogurt client", () => {
  it("lists and fetches meetings", async () => {
    const p = sockPath();
    server = await fakeYogurt(p, [meeting("a", "2026-11-19T10:00:00Z"), meeting("b", "2026-11-20T10:00:00Z", { summary: "## Hi" })]);
    const c = await connectSocket(p);
    const list = await c.listMeetings({});
    expect(list.map((m) => m.id)).toEqual(["b", "a"]);
    expect((await c.getMeeting("b")).summary).toBe("## Hi");
    expect((await c.listMeetings({ before: "2026-11-20T00:00:00Z" })).map((m) => m.id)).toEqual(["a"]);
    c.close();
  });
  it("reports not-running when there is no socket", async () => {
    await expect(connectSocket(sockPath())).rejects.toMatchObject({ kind: "not-running" });
  });
  it("reports disabled when AI apps access is off", async () => {
    const p = sockPath();
    server = await fakeYogurt(p, [], { enabled: false });
    const c = await connectSocket(p);
    const err = await c.listMeetings({}).catch((e) => e);
    expect(err).toBeInstanceOf(YogurtError);
    expect(err.kind).toBe("disabled");
    c.close();
  });
  it("reports failed for an unknown meeting", async () => {
    const p = sockPath();
    server = await fakeYogurt(p, []);
    const c = await connectSocket(p);
    await expect(c.getMeeting("zzz")).rejects.toMatchObject({ kind: "failed" });
    c.close();
  });
});
