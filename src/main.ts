import { FuzzySuggestModal, Notice, Plugin, TFile } from "obsidian";
import { moment } from "./moment";
import { readFileSync } from "fs";
import { homedir } from "os";
import { createDashboard } from "./integrations/dashboard";
import { linkFromDailyNote } from "./integrations/dailyNotes";
import { PeopleResolver } from "./integrations/people";
import { DEFAULT_SETTINGS, EMPTY_STATE, type SyncState, type YogurtSettings } from "./settings-data";
import { YogurtSettingTab } from "./settings";
import { runSync } from "./sync/engine";
import { indexMeetingNotes, ObsidianPort } from "./sync/obsidianPort";
import { connectHelper, connectSocket, YogurtError, type YogurtConnection } from "./yogurt/client";
import { locateYogurt } from "./yogurt/locate";

const format = (iso: string, f: string) => moment(iso).format(f);

export default class YogurtSyncPlugin extends Plugin {
  settings: YogurtSettings = { ...DEFAULT_SETTINGS };
  state: SyncState = { ...EMPTY_STATE, synced: {} };
  private statusEl!: HTMLElement;
  private running = false;
  private interval: number | null = null;
  private lastStatus = "Not synced yet";

  async onload() {
    const data = (await this.loadData()) as { settings?: Partial<YogurtSettings>; state?: SyncState } | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) };
    this.state = { ...EMPTY_STATE, ...(data?.state ?? {}), synced: { ...(data?.state?.synced ?? {}) } };

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("mod-clickable");
    this.statusEl.setAttr("aria-label", "Sync Yogurt meetings");
    this.registerDomEvent(this.statusEl, "click", () => void this.sync({ manual: true }));
    this.setStatus(this.state.lastSync ? `Yogurt: synced ${moment(this.state.lastSync).fromNow()}` : "Yogurt");

    this.addRibbonIcon("refresh-ccw", "Sync Yogurt meetings", () => void this.sync({ manual: true }));
    this.addCommand({ id: "sync", name: "Sync meetings now", callback: () => void this.sync({ manual: true }) });
    this.addCommand({ id: "full-resync", name: "Full resync (re-import the lookback period)", callback: () => void this.sync({ manual: true, full: true }) });
    this.addCommand({ id: "dashboard", name: "Create meetings dashboard", callback: () => void this.createDashboard() });
    this.addCommand({ id: "open", name: "Open a meeting note", callback: () => new MeetingPicker(this).open() });
    this.addSettingTab(new YogurtSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.syncOnStartup) void this.sync({ manual: false });
      this.scheduleInterval();
    });
  }

  onunload() { if (this.interval != null) window.clearInterval(this.interval); }

  async saveAll() { await this.saveData({ settings: this.settings, state: this.state }); }

  scheduleInterval() {
    if (this.interval != null) window.clearInterval(this.interval);
    this.interval = null;
    const mins = this.settings.intervalMinutes;
    if (mins > 0) this.interval = this.registerInterval(window.setInterval(() => void this.sync({ manual: false }), mins * 60000));
  }

  statusText() { return this.lastStatus; }

  private setStatus(text: string) {
    this.lastStatus = text;
    this.statusEl?.setText(text);
  }

  private connect(): Promise<YogurtConnection> {
    if (this.settings.connection === "helper") {
      if (!this.settings.helperPath) throw new YogurtError("not-running", "Set the helper command in the Yogurt Sync settings.");
      return connectHelper(this.settings.helperPath);
    }
    const { address } = locateYogurt({
      platform: process.platform, env: process.env, home: homedir(), override: this.settings.socketPath,
      readFile: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
    });
    if (!address) throw new YogurtError("not-running", "Yogurt isn't running.");
    return connectSocket(address);
  }

  async sync(o: { manual: boolean; full?: boolean }) {
    if (this.running) { if (o.manual) new Notice("Yogurt sync is already running."); return; }
    this.running = true;
    this.setStatus("Yogurt: syncing…");
    let conn: YogurtConnection | undefined;
    try {
      conn = await this.connect();
      const people = new PeopleResolver(this.app, this.settings);
      const { result, state } = await runSync({
        conn, settings: this.settings, state: this.state, format, full: o.full,
        port: new ObsidianPort(this.app, this.settings),
        hooks: {
          attendeeLink: (a) => people.attendeeLink(a),
          afterCreate: async (path, m) => {
            try { await linkFromDailyNote(this.app, this.settings, path, m); } catch (e) { console.warn("[yogurt-sync] daily note", e); }
          },
          log: (msg) => console.info(`[yogurt-sync] ${msg}`),
        },
      });
      this.state = state;
      await this.saveAll();
      const parts = [result.created && `${result.created} new`, result.updated && `${result.updated} updated`].filter(Boolean).join(", ");
      this.setStatus(`Yogurt: synced ${moment().format("HH:mm")}`);
      if (result.errors.length) {
        console.warn("[yogurt-sync] errors", result.errors);
        new Notice(`Yogurt sync: ${result.errors.length} meeting(s) failed. See the developer console.`);
      }
      if (parts) new Notice(`Yogurt: ${parts}.`);
      else if (o.manual) new Notice("Yogurt: everything is up to date.");
    } catch (e) {
      const err = e instanceof YogurtError ? e : new YogurtError("failed", (e as Error).message);
      const label = { "not-running": "Yogurt: not running", disabled: "Yogurt: AI apps access is off", failed: "Yogurt: sync failed" }[err.kind];
      this.setStatus(label);
      if (o.manual || err.kind !== "not-running") {
        new Notice(err.kind === "disabled"
          ? "Turn on Yogurt → Settings → AI apps so Obsidian can read your meetings."
          : `${label}. ${err.message}`);
      }
      if (err.kind === "failed") console.error("[yogurt-sync]", e);
    } finally {
      conn?.close();
      this.running = false;
    }
  }

  createDashboard() { return createDashboard(this.app, this.settings); }
}

class MeetingPicker extends FuzzySuggestModal<TFile> {
  constructor(private plugin: YogurtSyncPlugin) { super(plugin.app); this.setPlaceholder("Find a meeting…"); }
  getItems(): TFile[] {
    const date = (f: TFile) => String(this.app.metadataCache.getFileCache(f)?.frontmatter?.[`${this.plugin.settings.propertyPrefix}date`] ?? "");
    return [...indexMeetingNotes(this.app).values()].sort((a, b) => date(b).localeCompare(date(a)));
  }
  getItemText(f: TFile) { return f.basename; }
  onChooseItem(f: TFile) { void this.app.workspace.getLeaf(false).openFile(f); }
}

