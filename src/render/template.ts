/** Formats an ISO time with a moment.js format string (Obsidian's moment in the plugin, plain moment in tests). */
export type DateFormatter = (iso: string, format: string) => string;

export type TemplateDates = { date: string | null; start: string | null; end: string | null };

const DEFAULT_FORMATS: Record<string, string> = { date: "YYYY-MM-DD", start: "HH:mm", end: "HH:mm" };
const PLACEHOLDER = /\{\{\s*([A-Za-z][\w-]*)(?::([^}]*?))?\s*\}\}/g;

/**
 * Replaces {{name}} and {{date:FORMAT}} placeholders. Placeholders it doesn't know (such as {{yogurt}}) are left
 * as they are, so other tools and later steps can still see them.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  dates: TemplateDates,
  format: DateFormatter,
): string {
  return template.replace(PLACEHOLDER, (whole, name: string, fmt: string | undefined) => {
    if (name in DEFAULT_FORMATS) {
      const iso = dates[name as keyof TemplateDates];
      return iso ? format(iso, fmt?.trim() || DEFAULT_FORMATS[name]) : "";
    }
    if (fmt === undefined && Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    return whole;
  });
}

const FORBIDDEN = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

export function sanitizeFileName(name: string, max = 120): string {
  const clean = name.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  const cut = clean.slice(0, max).replace(/[.\s]+$/, "");
  return cut || "Untitled meeting";
}

export function sanitizeFolder(path: string): string {
  return path
    .split("/")
    .map((seg) => seg.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/** The part of a folder pattern that doesn't vary: "Meetings" for "Meetings/{{date:YYYY}}/{{date:MM}}". */
export function fixedFolder(pattern: string): string {
  const at = pattern.indexOf("{{");
  const fixed = at < 0 ? pattern : pattern.slice(0, at).replace(/[^/]*$/, "");
  return sanitizeFolder(fixed);
}
