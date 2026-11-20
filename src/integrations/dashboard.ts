import { Notice, normalizePath, TFile, type App } from "obsidian";
import type { YogurtSettings } from "../settings-data";
import { hasBases, hasDataview } from "./detect";
import { fixedFolder } from "../render/template";


function basesFile(s: YogurtSettings): string {
  const p = s.propertyPrefix;
  return [
    "filters:",
    "  and:",
    '    - file.hasProperty("yogurt-id")',
    "views:",
    "  - type: table",
    "    name: Meetings",
    "    order:",
    "      - file.name",
    `      - ${p}date`,
    `      - ${p}attendees`,
    `      - ${p}calendar`,
    "    sort:",
    `      - property: ${p}date`,
    "        direction: DESC",
    "",
  ].join("\n");
}

function dataviewNote(s: YogurtSettings): string {
  const p = s.propertyPrefix;
  const f = (k: string) => `file.frontmatter["${p}${k}"]`;
  return [
    "```dataview",
    `TABLE ${f("date")} AS "Date", ${f("attendees")} AS "Attendees", ${f("calendar")} AS "Calendar"`,
    'WHERE file.frontmatter["yogurt-id"]',
    `SORT ${f("date")} DESC`,
    "```",
    "",
  ].join("\n");
}

/** Creates (or opens) a meetings overview: a Base when core Bases is on, else a Dataview table. */
export async function createDashboard(app: App, s: YogurtSettings): Promise<void> {
  const folder = fixedFolder(s.folderPattern);
  const at = (name: string) => normalizePath(folder ? `${folder}/${name}` : name);
  let path: string;
  let content: string;
  if (hasBases(app)) { path = at("Meetings.base"); content = basesFile(s); }
  else if (hasDataview(app)) { path = at("Meetings dashboard.md"); content = dataviewNote(s); }
  else { new Notice("Turn on the core Bases plugin or install Dataview to get a meetings dashboard."); return; }
  let file = app.vault.getAbstractFileByPath(path);
  if (!file) {
    if (folder && !app.vault.getAbstractFileByPath(normalizePath(folder))) await app.vault.createFolder(normalizePath(folder));
    file = await app.vault.create(path, content);
  }
  if (file instanceof TFile) await app.workspace.getLeaf(false).openFile(file);
}
