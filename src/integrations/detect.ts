import type { App } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";

/** Undocumented but stable parts of App used to see which plugins are on. */
type AppInternals = App & {
  plugins?: { plugins?: Record<string, unknown>; enabledPlugins?: Set<string> };
  internalPlugins?: { getEnabledPluginById?: (id: string) => unknown; plugins?: Record<string, { enabled?: boolean }> };
};

const community = (app: App, id: string): unknown => {
  const a = app as AppInternals;
  return a.plugins?.enabledPlugins?.has(id) ? a.plugins?.plugins?.[id] : undefined;
};

export const templaterPlugin = (app: App) => community(app, "templater-obsidian") as
  | { templater?: { write_template_to_file?: (template: unknown, target: unknown) => Promise<void> } }
  | undefined;

export const hasTemplater = (app: App) => !!templaterPlugin(app)?.templater?.write_template_to_file;
export const hasDataview = (app: App) => !!community(app, "dataview");
export function hasBases(app: App): boolean {
  const i = (app as AppInternals).internalPlugins;
  return !!(i?.getEnabledPluginById?.("bases") ?? i?.plugins?.bases?.enabled);
}
export function hasDailyNotes(): boolean {
  try { return appHasDailyNotesPluginLoaded(); } catch { return false; }
}
