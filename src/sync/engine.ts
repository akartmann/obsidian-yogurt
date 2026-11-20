import { placeInTemplate, replaceBlock, wrapBlock } from "../render/block";
import { buildBlockInner, buildProperties, contentHash, otherAttendees, templateVars } from "../render/note";
import { renderTemplate, sanitizeFileName, sanitizeFolder, type DateFormatter } from "../render/template";
import { splitList, type SyncState, type YogurtSettings } from "../settings-data";
import type { Attendee, MeetingDetail, MeetingSummary } from "../types";
import type { YogurtConnection } from "../yogurt/client";

/** What the engine needs from the vault; Obsidian implements it in sync/obsidianPort.ts, tests in memory. */
export interface VaultPort {
  findByYogurtId(id: string): string | null;
  exists(path: string): boolean;
  ensureFolder(path: string): Promise<void>;
  create(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
  process(path: string, fn: (content: string) => string): Promise<void>;
  /** sets the owned keys and adds `tags` to whatever tags the note already has */
  setFrontmatter(path: string, owned: Record<string, unknown>, tags: string[]): Promise<void>;
  /** template text from the configured template file; null for the built-in one */
  readTemplate(): Promise<string | null>;
  /** when Templater should handle the template: writes it into the (empty) note at `path` */
  applyTemplater?: (path: string) => Promise<boolean>;
}

export interface SyncHooks {
  /** link text for an attendee (may create a person note) */
  attendeeLink(a: Attendee): Promise<string>;
  /** called once per newly created note */
  afterCreate?(path: string, m: MeetingDetail): Promise<void>;
  log?(msg: string): void;
}

export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
}

export const BUILTIN_TEMPLATE = "{{yogurt}}\n";
const DAY = 86400000;
const PAGE = 100;

export function cutoffFor(s: YogurtSettings, state: SyncState, full: boolean, now: number): number {
  const lookback = s.lookbackDays > 0 ? now - s.lookbackDays * DAY : -Infinity;
  if (full || !state.lastSync) return lookback;
  return Math.max(lookback, now - Math.max(1, s.recheckDays) * DAY);
}

/** Pages through list_meetings (newest first) down to the cutoff. */
export async function listSince(conn: YogurtConnection, cutoff: number): Promise<MeetingSummary[]> {
  const out: MeetingSummary[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await conn.listMeetings({ before, limit: PAGE });
    for (const m of page) {
      if (!m.start || Date.parse(m.start) < cutoff) return out;
      out.push(m);
    }
    if (page.length < PAGE) return out;
    const last = page[page.length - 1].start;
    if (!last || last === before) return out;
    before = last;
  }
}

export function resolvePath(m: MeetingDetail, s: YogurtSettings, fmt: DateFormatter): { folder: string; base: string } {
  const dates = { date: m.start, start: m.start, end: m.end };
  const vars = { title: m.title || "Untitled meeting", id: m.id, calendar: m.calendar_event?.calendar ?? "", app: m.app ?? "" };
  const folder = sanitizeFolder(renderTemplate(s.folderPattern, vars, dates, fmt));
  const base = sanitizeFileName(renderTemplate(s.fileNamePattern || "{{title}}", vars, dates, fmt));
  return { folder, base };
}

function freePath(port: VaultPort, folder: string, base: string): string {
  const at = (name: string) => (folder ? `${folder}/${name}.md` : `${name}.md`);
  if (!port.exists(at(base))) return at(base);
  for (let n = 2; n < 1000; n++) if (!port.exists(at(`${base} (${n})`))) return at(`${base} (${n})`);
  throw new Error(`No free file name for ${base}`);
}

export async function runSync(o: {
  conn: YogurtConnection;
  port: VaultPort;
  hooks: SyncHooks;
  settings: YogurtSettings;
  state: SyncState;
  format: DateFormatter;
  full?: boolean;
  now?: number;
}): Promise<{ result: SyncResult; state: SyncState }> {
  const { conn, port, hooks, settings: s, format } = o;
  const now = o.now ?? Date.now();
  const state: SyncState = { lastSync: o.state.lastSync, synced: { ...o.state.synced } };
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };
  const tags = splitList(s.tags);

  const list = await listSince(conn, cutoffFor(s, o.state, !!o.full, now));
  for (const summary of list) {
    if (summary.recording) { result.skipped++; continue; }
    try {
      const m = await conn.getMeeting(summary.id);
      const inner = buildBlockInner(m, s);
      if (!inner) { result.skipped++; continue; } // nothing written yet; try again next run
      const links: string[] = [];
      for (const a of otherAttendees(m, s.excludeSelf)) links.push(await hooks.attendeeLink(a));
      const block = wrapBlock(inner);
      const props = buildProperties(m, s, links, format);
      const hash = contentHash(block, { props, tags });
      const existing = port.findByYogurtId(m.id);

      if (existing) {
        if (state.synced[m.id] === hash) { result.unchanged++; continue; }
        let replaced = true;
        await port.process(existing, (c) => { const r = replaceBlock(c, block); replaced = r.replaced; return r.content; });
        if (!replaced) hooks.log?.(`${existing}: managed block was missing, appended a new one`);
        await port.setFrontmatter(existing, props, tags);
        state.synced[m.id] = hash;
        result.updated++;
        continue;
      }
      if (state.synced[m.id] && !o.full && !s.recreateDeleted) { result.skipped++; continue; } // deleted on purpose

      const { folder, base } = resolvePath(m, s, format);
      if (folder) await port.ensureFolder(folder);
      const path = freePath(port, folder, base);
      const vars = templateVars(m, links);
      const dates = { date: m.start, start: m.start, end: m.end };
      let body: string;
      if (s.useTemplater && port.applyTemplater) {
        await port.create(path, "");
        body = (await port.applyTemplater(path)) ? await port.read(path) : (await port.readTemplate()) ?? BUILTIN_TEMPLATE;
        await port.process(path, () => placeInTemplate(renderTemplate(body, vars, dates, format), block));
      } else {
        body = (await port.readTemplate()) ?? BUILTIN_TEMPLATE;
        await port.create(path, placeInTemplate(renderTemplate(body, vars, dates, format), block));
      }
      await port.setFrontmatter(path, props, tags);
      state.synced[m.id] = hash;
      result.created++;
      await hooks.afterCreate?.(path, m);
    } catch (e) {
      result.errors.push(`${summary.title || summary.id}: ${(e as Error).message}`);
    }
  }
  state.lastSync = new Date(now).toISOString();
  return { result, state };
}
