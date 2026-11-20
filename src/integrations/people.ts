import { normalizePath, TFile, type App } from "obsidian";
import { sanitizeFileName, sanitizeFolder } from "../render/template";
import type { YogurtSettings } from "../settings-data";
import type { Attendee } from "../types";

const lower = (s: string) => s.trim().toLowerCase();
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

/**
 * Turns attendees into links. An existing note is matched by its `email` property, then by name or alias;
 * when none matches and a people folder is set, a person note is created there.
 */
export class PeopleResolver {
  private byEmail = new Map<string, TFile>();
  private byName = new Map<string, TFile>();

  constructor(private app: App, private s: YogurtSettings) {
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      for (const e of asList(fm?.email)) this.byEmail.set(lower(e), f);
      for (const a of asList(fm?.aliases)) if (!this.byName.has(lower(a))) this.byName.set(lower(a), f);
      if (!this.byName.has(lower(f.basename))) this.byName.set(lower(f.basename), f);
    }
  }

  private link(f: TFile | null, name: string): string {
    if (!f) return `[[${name}]]`;
    return lower(f.basename) === lower(name) ? `[[${f.basename}]]` : `[[${f.basename}|${name}]]`;
  }

  async attendeeLink(a: Attendee): Promise<string> {
    if (!this.s.linkAttendees) return a.name;
    const found = (a.email && this.byEmail.get(lower(a.email))) || this.byName.get(lower(a.name)) || null;
    if (found || !this.s.peopleFolder.trim()) return this.link(found, a.name);
    return this.link(await this.createPerson(a), a.name);
  }

  private async createPerson(a: Attendee): Promise<TFile | null> {
    const folder = sanitizeFolder(this.s.peopleFolder);
    const path = normalizePath(`${folder}/${sanitizeFileName(a.name)}.md`);
    try {
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder).catch(() => undefined);
      const existing = this.app.vault.getAbstractFileByPath(path);
      const f = existing instanceof TFile ? existing : await this.app.vault.create(path, "");
      await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
        if (a.email && !asList(fm.email).some((e) => lower(e) === lower(a.email!))) fm.email = a.email;
        const tags = asList(fm.tags);
        if (!tags.includes("person")) fm.tags = [...tags, "person"];
      });
      if (a.email) this.byEmail.set(lower(a.email), f);
      this.byName.set(lower(a.name), f);
      return f;
    } catch (e) {
      console.warn("[yogurt-sync] could not create person note", path, e);
      return null;
    }
  }
}
