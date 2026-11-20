import { normalizePath, TFile, TFolder, type App } from "obsidian";
import { ID_KEY } from "../render/note";
import type { YogurtSettings } from "../settings-data";
import { templaterPlugin } from "../integrations/detect";
import type { VaultPort } from "./engine";

const normTag = (t: unknown) => String(t).trim().replace(/^#/, "");

export function mergeTags(existing: unknown, add: string[]): string[] {
  const cur = Array.isArray(existing) ? existing : typeof existing === "string" ? existing.split(/[,\s]+/) : [];
  const out: string[] = [];
  for (const t of [...cur, ...add].map(normTag).filter(Boolean)) if (!out.includes(t)) out.push(t);
  return out;
}

/** Every note carrying a yogurt-id, by id. Built from the metadata cache, so moves and renames don't matter. */
export function indexMeetingNotes(app: App): Map<string, TFile> {
  const index = new Map<string, TFile>();
  for (const f of app.vault.getMarkdownFiles()) {
    const id = app.metadataCache.getFileCache(f)?.frontmatter?.[ID_KEY];
    if (typeof id === "string" && id) index.set(id, f);
  }
  return index;
}

export class ObsidianPort implements VaultPort {
  private index: Map<string, TFile>;
  applyTemplater?: (path: string) => Promise<boolean>;

  constructor(private app: App, private s: YogurtSettings) {
    this.index = indexMeetingNotes(app);
    if (s.useTemplater && s.templatePath) this.applyTemplater = (p) => this.runTemplater(p);
  }

  private file(path: string): TFile {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(f instanceof TFile)) throw new Error(`Not a file: ${path}`);
    return f;
  }

  findByYogurtId(id: string): string | null {
    const f = this.index.get(id);
    return f && this.app.vault.getAbstractFileByPath(f.path) ? f.path : null;
  }

  /** case-insensitive, as on macOS and Windows a differently cased name is the same file */
  exists(path: string): boolean {
    const p = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(p)) return true;
    const slash = p.lastIndexOf("/");
    const parent = slash < 0 ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(p.slice(0, slash));
    const name = p.slice(slash + 1).toLowerCase();
    return parent instanceof TFolder && parent.children.some((c) => c.name.toLowerCase() === name);
  }

  async ensureFolder(path: string): Promise<void> {
    const p = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(p)) return;
    try { await this.app.vault.createFolder(p); } catch (e) {
      if (!this.app.vault.getAbstractFileByPath(p)) throw e;
    }
  }

  async create(path: string, content: string): Promise<void> {
    await this.app.vault.create(normalizePath(path), content);
  }

  read(path: string): Promise<string> { return this.app.vault.read(this.file(path)); }

  async process(path: string, fn: (c: string) => string): Promise<void> {
    await this.app.vault.process(this.file(path), fn);
  }

  async setFrontmatter(path: string, owned: Record<string, unknown>, tags: string[]): Promise<void> {
    const f = this.file(path);
    await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
      Object.assign(fm, owned);
      if (tags.length) fm.tags = mergeTags(fm.tags, tags);
    });
    const id = owned[ID_KEY];
    if (typeof id === "string") this.index.set(id, f);
  }

  async readTemplate(): Promise<string | null> {
    if (!this.s.templatePath) return null;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.s.templatePath));
    return f instanceof TFile ? this.app.vault.read(f) : null;
  }

  private async runTemplater(path: string): Promise<boolean> {
    const tp = templaterPlugin(this.app)?.templater;
    const tpl = this.app.vault.getAbstractFileByPath(normalizePath(this.s.templatePath));
    if (!tp?.write_template_to_file || !(tpl instanceof TFile)) return false;
    await tp.write_template_to_file(tpl, this.file(path));
    return true;
  }
}
