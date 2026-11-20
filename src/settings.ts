import { AbstractInputSuggest, PluginSettingTab, Setting, TFile, TFolder, type App } from "obsidian";
import { moment } from "./moment";
import type YogurtSyncPlugin from "./main";
import { hasBases, hasDailyNotes, hasDataview, hasTemplater } from "./integrations/detect";
import { resolvePath } from "./sync/engine";
import type { MeetingDetail } from "./types";
import type { YogurtSettings } from "./settings-data";

class PathSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, private input: HTMLInputElement, private kind: "folder" | "file", private onPick: (v: string) => void) {
    super(app, input);
  }
  getSuggestions(q: string): string[] {
    const ql = q.toLowerCase();
    return this.app.vault.getAllLoadedFiles()
      .filter((f) => (this.kind === "folder" ? f instanceof TFolder : f instanceof TFile && f.extension === "md"))
      .map((f) => f.path)
      .filter((p) => p !== "/" && p.toLowerCase().includes(ql))
      .slice(0, 50);
  }
  renderSuggestion(v: string, el: HTMLElement) { el.setText(v); }
  selectSuggestion(v: string) { this.input.value = v; this.onPick(v); this.close(); }
}

const SAMPLE: MeetingDetail = {
  id: "sample", title: "Weekly product sync", start: new Date().toISOString(),
  end: new Date(Date.now() + 45 * 60000).toISOString(), people: [], attendees: [], app: "Zoom", recording: false,
  calendar_event: { title: null, start: null, end: null, calendar: "Work" }, myNotes: "", summary: "",
};

export class YogurtSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: YogurtSyncPlugin) { super(app, plugin); }

  private get s(): YogurtSettings { return this.plugin.settings; }
  private save = async (patch: Partial<YogurtSettings>) => { Object.assign(this.s, patch); await this.plugin.saveAll(); };

  display(): void {
    const { containerEl: el, app } = this;
    el.empty();

    // ── Where notes go
    new Setting(el).setName("Notes").setHeading();
    const preview = el.createDiv({ cls: "setting-item-description" });
    const refreshPreview = () => {
      const { folder, base } = resolvePath(SAMPLE, this.s, (iso, f) => moment(iso).format(f));
      preview.setText(`Example: ${folder ? folder + "/" : ""}${base}.md`);
    };
    new Setting(el).setName("Folder").setDesc("Supports {{date:FORMAT}} (moment.js), {{title}}, {{calendar}}, {{app}}.")
      .addText((t) => {
        t.setPlaceholder("Meetings/{{date:YYYY}}/{{date:MM}}").setValue(this.s.folderPattern)
          .onChange(async (v) => { await this.save({ folderPattern: v }); refreshPreview(); });
        new PathSuggest(app, t.inputEl, "folder", async (v) => { await this.save({ folderPattern: v }); refreshPreview(); });
      });
    new Setting(el).setName("File name").setDesc("Same placeholders as the folder. Unsafe characters are removed.")
      .addText((t) => t.setPlaceholder("{{date:YYYY-MM-DD}} {{title}}").setValue(this.s.fileNamePattern)
        .onChange(async (v) => { await this.save({ fileNamePattern: v }); refreshPreview(); }));
    el.appendChild(preview);
    refreshPreview();

    new Setting(el).setName("Template").setDesc(
      "Optional note used as the body of new meeting notes. Put {{yogurt}} where the synced content goes (otherwise it is appended). " +
      "Variables: {{title}} {{date:FORMAT}} {{start:HH:mm}} {{end:HH:mm}} {{duration}} {{attendees}} {{attendeeLinks}} {{calendar}} {{app}} {{id}}.")
      .addText((t) => {
        t.setPlaceholder("Templates/Meeting.md").setValue(this.s.templatePath).onChange((v) => this.save({ templatePath: v.trim() }));
        new PathSuggest(app, t.inputEl, "file", (v) => this.save({ templatePath: v }));
      });
    const templater = hasTemplater(app);
    new Setting(el).setName("Run the template through Templater")
      .setDesc(templater ? "Templater commands (<% %>) in the template run when a meeting note is created." : "Install and enable Templater to use this.")
      .addToggle((t) => t.setValue(this.s.useTemplater && templater).setDisabled(!templater).onChange((v) => this.save({ useTemplater: v })));

    // ── Synced content
    new Setting(el).setName("Synced content").setHeading()
      .setDesc("Only the part between <!-- yogurt:start --> and <!-- yogurt:end --> is rewritten. Write anything you like around it.");
    new Setting(el).setName("Summary").setDesc("Yogurt's written summary, and its heading.")
      .addText((t) => t.setValue(this.s.summaryHeading).onChange((v) => this.save({ summaryHeading: v })))
      .addToggle((t) => t.setValue(this.s.includeSummary).onChange((v) => this.save({ includeSummary: v })));
    new Setting(el).setName("My notes").setDesc("What you typed during the meeting, and its heading.")
      .addText((t) => t.setValue(this.s.myNotesHeading).onChange((v) => this.save({ myNotesHeading: v })))
      .addToggle((t) => t.setValue(this.s.includeMyNotes).onChange((v) => this.save({ includeMyNotes: v })));

    // ── Properties
    new Setting(el).setName("Properties").setHeading();
    new Setting(el).setName("Property prefix").setDesc("Prefix for date, end, attendees, calendar and app (yogurt-id is always kept as is). Example: \"meeting-\".")
      .addText((t) => t.setValue(this.s.propertyPrefix).onChange((v) => this.save({ propertyPrefix: v.trim() })));
    new Setting(el).setName("Tags").setDesc("Comma-separated. Added to new and updated notes; your own tags are kept.")
      .addText((t) => t.setValue(this.s.tags).onChange((v) => this.save({ tags: v })));

    // ── People
    new Setting(el).setName("People").setHeading();
    new Setting(el).setName("Link attendees").setDesc("Attendees become [[links]], matched to existing notes by their email property, name or alias.")
      .addToggle((t) => t.setValue(this.s.linkAttendees).onChange((v) => this.save({ linkAttendees: v })));
    new Setting(el).setName("People folder").setDesc("When set, a note is created here for each new attendee (with their email). Leave empty to only link.")
      .addText((t) => {
        t.setPlaceholder("People").setValue(this.s.peopleFolder).onChange((v) => this.save({ peopleFolder: v.trim() }));
        new PathSuggest(app, t.inputEl, "folder", (v) => this.save({ peopleFolder: v }));
      });
    new Setting(el).setName("Leave out myself").setDesc("Your names or emails, comma-separated, so you aren't listed in every meeting.")
      .addText((t) => t.setValue(this.s.excludeSelf).onChange((v) => this.save({ excludeSelf: v })));

    // ── Integrations
    new Setting(el).setName("Integrations").setHeading();
    const daily = hasDailyNotes();
    new Setting(el).setName("Link from daily note")
      .setDesc(daily ? "Adds a link to each new meeting under a heading in that day's daily note." : "Turn on the Daily notes core plugin or Periodic Notes to use this.")
      .addText((t) => t.setValue(this.s.dailyNoteHeading).setDisabled(!daily).onChange((v) => this.save({ dailyNoteHeading: v })))
      .addToggle((t) => t.setValue(this.s.dailyNoteLink && daily).setDisabled(!daily).onChange((v) => this.save({ dailyNoteLink: v })));
    const dash = hasBases(app) ? "Bases" : hasDataview(app) ? "Dataview" : null;
    new Setting(el).setName("Meetings dashboard")
      .setDesc(dash ? `Creates a table of all meetings using ${dash}.` : "Turn on the Bases core plugin or install Dataview to use this.")
      .addButton((b) => b.setButtonText("Create").setDisabled(!dash).onClick(() => this.plugin.createDashboard()));

    // ── Sync
    new Setting(el).setName("Sync").setHeading();
    new Setting(el).setName("Sync when Obsidian starts").addToggle((t) => t.setValue(this.s.syncOnStartup).onChange((v) => this.save({ syncOnStartup: v })));
    new Setting(el).setName("Sync every (minutes)").setDesc("0 turns automatic sync off.")
      .addText((t) => t.setValue(String(this.s.intervalMinutes)).onChange(async (v) => {
        const n = Number(v); if (!Number.isFinite(n) || n < 0) return;
        await this.save({ intervalMinutes: n }); this.plugin.scheduleInterval();
      }));
    new Setting(el).setName("Import meetings from the last (days)").setDesc("For the first sync and for a full resync. 0 means all meetings.")
      .addText((t) => t.setValue(String(this.s.lookbackDays)).onChange((v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) void this.save({ lookbackDays: n }); }));
    new Setting(el).setName("Re-check meetings from the last (days)").setDesc("Yogurt can rewrite a summary after the meeting; recent meetings are checked again on every sync.")
      .addText((t) => t.setValue(String(this.s.recheckDays)).onChange((v) => { const n = Number(v); if (Number.isFinite(n) && n >= 1) void this.save({ recheckDays: n }); }));
    new Setting(el).setName("Recreate notes I deleted").setDesc("Off: a meeting note you delete stays deleted (a full resync still brings it back).")
      .addToggle((t) => t.setValue(this.s.recreateDeleted).onChange((v) => this.save({ recreateDeleted: v })));
    new Setting(el).setName("Sync now").addButton((b) => b.setButtonText("Sync").setCta().onClick(() => this.plugin.sync({ manual: true })))
      .addButton((b) => b.setButtonText("Full resync").onClick(() => this.plugin.sync({ manual: true, full: true })));

    // ── Connection
    new Setting(el).setName("Connection").setHeading()
      .setDesc("In Yogurt, turn on Settings → AI apps. The plugin only reads; it never changes your meetings.");
    new Setting(el).setName("Connect through").setDesc("Yogurt's socket needs Yogurt to be open. The helper starts Yogurt in the background when it's closed.")
      .addDropdown((d) => d.addOption("socket", "Yogurt's socket (default)").addOption("helper", "yogurt-mcp helper command")
        .setValue(this.s.connection).onChange(async (v) => { await this.save({ connection: v as YogurtSettings["connection"] }); this.display(); }));
    if (this.s.connection === "socket") {
      new Setting(el).setName("Socket path").setDesc("Leave empty to find it automatically.")
        .addText((t) => t.setPlaceholder("auto").setValue(this.s.socketPath).onChange((v) => this.save({ socketPath: v.trim() })));
    } else {
      new Setting(el).setName("Helper command").setDesc("Copy it from Yogurt: Settings → AI apps.")
        .addText((t) => t.setPlaceholder("/Applications/Yogurt.app/Contents/Resources/bin/yogurt-mcp").setValue(this.s.helperPath)
          .onChange((v) => this.save({ helperPath: v.trim() })));
    }
    new Setting(el).setName("Status").setDesc(this.plugin.statusText());
  }
}
