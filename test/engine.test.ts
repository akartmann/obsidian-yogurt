import { describe, expect, it } from "vitest";
import moment from "moment";
import { cutoffFor, runSync, type VaultPort } from "../src/sync/engine";
import { BLOCK_END, BLOCK_START } from "../src/render/block";
import { DEFAULT_SETTINGS, EMPTY_STATE, type YogurtSettings } from "../src/settings-data";
import type { MeetingDetail } from "../src/types";
import type { YogurtConnection } from "../src/yogurt/client";
import { meeting } from "./fakeYogurt";

const fmt = (iso: string, f: string) => moment(iso).utc().format(f);
const NOW = Date.parse("2026-11-20T12:00:00Z");

class MemVault implements VaultPort {
  files = new Map<string, string>();
  fm = new Map<string, Record<string, unknown>>();
  folders = new Set<string>();
  template: string | null = null;
  findByYogurtId(id: string) { for (const [p, f] of this.fm) if (f["yogurt-id"] === id && this.files.has(p)) return p; return null; }
  exists(p: string) { return this.files.has(p); }
  async ensureFolder(p: string) { this.folders.add(p); }
  async create(p: string, c: string) { if (this.files.has(p)) throw new Error("exists"); this.files.set(p, c); }
  async read(p: string) { return this.files.get(p)!; }
  async process(p: string, fn: (c: string) => string) { this.files.set(p, fn(this.files.get(p)!)); }
  async setFrontmatter(p: string, owned: Record<string, unknown>, tags: string[]) {
    const cur = this.fm.get(p) ?? {};
    const t = new Set([...((cur.tags as string[]) ?? []), ...tags]);
    this.fm.set(p, { ...cur, ...owned, tags: [...t] });
  }
  async readTemplate() { return this.template; }
}

function conn(meetings: MeetingDetail[]): YogurtConnection & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listMeetings({ before, limit = 100 }) {
      calls.push(`list:${before ?? ""}`);
      const b = before ? Date.parse(before) : Infinity;
      return [...meetings].sort((x, y) => Date.parse(y.start!) - Date.parse(x.start!)).filter((m) => Date.parse(m.start!) < b).slice(0, limit);
    },
    async getMeeting(id) { calls.push(`get:${id}`); return meetings.find((m) => m.id === id)!; },
    close() {},
  };
}

const hooks = { attendeeLink: async (a: { name: string }) => `[[${a.name}]]` };
const run = (meetings: MeetingDetail[], v: MemVault, s: Partial<YogurtSettings> = {}, state = EMPTY_STATE, full = false) =>
  runSync({ conn: conn(meetings), port: v, hooks, settings: { ...DEFAULT_SETTINGS, ...s }, state, format: fmt, now: NOW, full });

describe("sync engine", () => {
  it("creates notes in the patterned folder with block and properties", async () => {
    const v = new MemVault();
    const { result, state } = await run([meeting("a", "2026-11-19T09:00:00Z", { title: "Plan: Q1" })], v);
    expect(result).toMatchObject({ created: 1, updated: 0 });
    const path = "Meetings/2026/11/2026-11-19 Plan Q1.md";
    expect(v.files.get(path)).toBe(`${BLOCK_START}\n## Summary\n\nSummary of a\n${BLOCK_END}\n`);
    expect(v.fm.get(path)).toMatchObject({ "yogurt-id": "a", date: "2026-11-19T09:00", attendees: ["[[Ana]]"], tags: ["meeting"] });
    expect(state.synced.a).toBeTruthy();
    expect(state.lastSync).toBe(new Date(NOW).toISOString());
  });

  it("leaves unchanged notes alone and updates only the block when content changes", async () => {
    const v = new MemVault();
    const ms = [meeting("a", "2026-11-19T09:00:00Z")];
    const first = await run(ms, v);
    const path = [...v.files.keys()][0];
    v.files.set(path, `My intro\n${v.files.get(path)}My outro\n`);
    const second = await run(ms, v, {}, first.state);
    expect(second.result).toMatchObject({ unchanged: 1, updated: 0 });
    ms[0].summary = "Better summary";
    const third = await run(ms, v, {}, second.state);
    expect(third.result.updated).toBe(1);
    expect(v.files.get(path)).toBe(`My intro\n${BLOCK_START}\n## Summary\n\nBetter summary\n${BLOCK_END}\nMy outro\n`);
  });

  it("keeps the person's tags when updating", async () => {
    const v = new MemVault();
    const ms = [meeting("a", "2026-11-19T09:00:00Z")];
    const first = await run(ms, v);
    const path = [...v.files.keys()][0];
    v.fm.set(path, { ...v.fm.get(path), tags: ["meeting", "project/x"] });
    ms[0].summary = "changed";
    await run(ms, v, {}, first.state);
    expect(v.fm.get(path)!.tags).toEqual(["meeting", "project/x"]);
  });

  it("skips recordings in progress and meetings with nothing written yet", async () => {
    const v = new MemVault();
    const { result } = await run([
      meeting("rec", "2026-11-19T09:00:00Z", { recording: true }),
      meeting("empty", "2026-11-18T09:00:00Z", { summary: null, myNotes: "" }),
    ], v);
    expect(result).toMatchObject({ created: 0, skipped: 2 });
  });

  it("gives colliding names a number", async () => {
    const v = new MemVault();
    await run([meeting("a", "2026-11-19T09:00:00Z", { title: "Sync" }), meeting("b", "2026-11-19T15:00:00Z", { title: "Sync" })], v);
    expect([...v.files.keys()].sort()).toEqual(["Meetings/2026/11/2026-11-19 Sync (2).md", "Meetings/2026/11/2026-11-19 Sync.md"]);
  });

  it("uses a template with {{yogurt}} and variables", async () => {
    const v = new MemVault();
    v.template = "# {{title}}\n{{duration}} with {{attendeeLinks}}\n\n{{yogurt}}\n\n## Follow-ups\n";
    await run([meeting("a", "2026-11-19T09:00:00Z", { title: "Kickoff" })], v);
    expect([...v.files.values()][0]).toBe(`# Kickoff\n30 min with [[Ana]]\n\n${BLOCK_START}\n## Summary\n\nSummary of a\n${BLOCK_END}\n\n## Follow-ups\n`);
  });

  it("does not recreate a note the person deleted, unless asked", async () => {
    const v = new MemVault();
    const ms = [meeting("a", "2026-11-19T09:00:00Z")];
    const first = await run(ms, v);
    v.files.clear();
    expect((await run(ms, v, {}, first.state)).result.skipped).toBe(1);
    expect((await run(ms, v, { recreateDeleted: true }, first.state)).result.created).toBe(1);
  });

  it("appends a block when the person removed the markers", async () => {
    const v = new MemVault();
    const ms = [meeting("a", "2026-11-19T09:00:00Z")];
    const first = await run(ms, v);
    const path = [...v.files.keys()][0];
    v.files.set(path, "only my words\n");
    ms[0].summary = "new";
    await run(ms, v, {}, first.state);
    expect(v.files.get(path)).toBe(`only my words\n\n${BLOCK_START}\n## Summary\n\nnew\n${BLOCK_END}\n`);
  });

  it("pages back through list_meetings until the cutoff", async () => {
    const ms = Array.from({ length: 150 }, (_, i) => meeting(`m${i}`, new Date(NOW - (i + 1) * 3600000).toISOString()));
    const c = conn(ms);
    const v = new MemVault();
    const { result } = await runSync({ conn: c, port: v, hooks, settings: DEFAULT_SETTINGS, state: EMPTY_STATE, format: fmt, now: NOW });
    expect(result.created).toBe(150);
    expect(c.calls.filter((x) => x.startsWith("list")).length).toBe(2);
  });

  it("first run uses the lookback, later runs the re-check window, full resync the lookback", () => {
    const s = { ...DEFAULT_SETTINGS, lookbackDays: 30, recheckDays: 14 };
    expect(cutoffFor(s, EMPTY_STATE, false, NOW)).toBe(NOW - 30 * 86400000);
    expect(cutoffFor(s, { lastSync: "x", synced: {} }, false, NOW)).toBe(NOW - 14 * 86400000);
    expect(cutoffFor(s, { lastSync: "x", synced: {} }, true, NOW)).toBe(NOW - 30 * 86400000);
    expect(cutoffFor({ ...s, lookbackDays: 0 }, EMPTY_STATE, true, NOW)).toBe(-Infinity);
  });

  it("collects per-meeting errors without stopping the run", async () => {
    const v = new MemVault();
    const c = conn([meeting("a", "2026-11-19T09:00:00Z"), meeting("b", "2026-11-18T09:00:00Z")]);
    const orig = c.getMeeting;
    c.getMeeting = async (id) => { if (id === "a") throw new Error("boom"); return orig(id); };
    const { result } = await runSync({ conn: c, port: v, hooks, settings: DEFAULT_SETTINGS, state: EMPTY_STATE, format: fmt, now: NOW });
    expect(result.created).toBe(1);
    expect(result.errors[0]).toContain("boom");
  });
});
