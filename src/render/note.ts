import { createHash } from "crypto";
import type { YogurtSettings } from "../settings-data";
import { splitList } from "../settings-data";
import type { Attendee, MeetingDetail } from "../types";
import type { DateFormatter } from "./template";

export const ID_KEY = "yogurt-id";
const PROPERTY_DATETIME = "YYYY-MM-DDTHH:mm";

/** Yogurt marks the person's own words in its summary with <mine> tags; they mean nothing in Obsidian. */
const clean = (md: string | null | undefined): string => (md ?? "").replace(/<\/?mine>/g, "").trim();

export function buildBlockInner(m: MeetingDetail, s: YogurtSettings): string {
  const parts: string[] = [];
  const section = (heading: string, body: string) => parts.push(heading.trim() ? `${heading.trim()}\n\n${body}` : body);
  const summary = clean(m.summary);
  const mine = clean(m.myNotes);
  if (s.includeSummary && summary) section(s.summaryHeading, summary);
  if (s.includeMyNotes && mine) section(s.myNotesHeading, mine);
  return parts.join("\n\n");
}

export function otherAttendees(m: MeetingDetail, excludeSelf: string): Attendee[] {
  const me = new Set(splitList(excludeSelf).map((x) => x.toLowerCase()));
  return m.attendees.filter((a) => !me.has(a.name.toLowerCase()) && !(a.email && me.has(a.email.toLowerCase())));
}

/** The frontmatter keys the plugin owns. Tags are merged separately so the person's own tags survive. */
export function buildProperties(
  m: MeetingDetail,
  s: YogurtSettings,
  attendeeLinks: string[],
  format: DateFormatter,
): Record<string, unknown> {
  const p = s.propertyPrefix;
  const props: Record<string, unknown> = { [ID_KEY]: m.id };
  if (m.start) props[`${p}date`] = format(m.start, PROPERTY_DATETIME);
  if (m.end) props[`${p}end`] = format(m.end, PROPERTY_DATETIME);
  props[`${p}attendees`] = attendeeLinks;
  if (m.calendar_event?.calendar) props[`${p}calendar`] = m.calendar_event.calendar;
  if (m.app) props[`${p}app`] = m.app;
  return props;
}

export function templateVars(m: MeetingDetail, attendeeLinks: string[]): Record<string, string> {
  const mins = m.start && m.end ? Math.round((Date.parse(m.end) - Date.parse(m.start)) / 60000) : null;
  return {
    id: m.id,
    title: m.title,
    duration: mins != null && mins >= 0 ? `${mins} min` : "",
    attendees: m.attendees.map((a) => a.name).join(", "),
    attendeeLinks: attendeeLinks.join(", "),
    calendar: m.calendar_event?.calendar ?? "",
    app: m.app ?? "",
    summary: clean(m.summary),
    myNotes: clean(m.myNotes),
  };
}

export function contentHash(block: string, props: Record<string, unknown>): string {
  return createHash("sha1").update(block).update("\u0000").update(JSON.stringify(props)).digest("hex");
}
