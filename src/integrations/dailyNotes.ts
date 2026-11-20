import { type App, TFile } from "obsidian";
import { moment } from "../moment";
import { createDailyNote, getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";
import { addLinkUnderHeading } from "../render/daily";
import type { YogurtSettings } from "../settings-data";
import type { MeetingDetail } from "../types";
import { hasDailyNotes } from "./detect";

/** Adds a link to the meeting in that day's daily note (core Daily notes or Periodic Notes), creating it if needed. */
export async function linkFromDailyNote(app: App, s: YogurtSettings, path: string, m: MeetingDetail): Promise<void> {
  if (!s.dailyNoteLink || !m.start || !hasDailyNotes()) return;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const day = moment(m.start);
  const daily = getDailyNote(day, getAllDailyNotes()) ?? (await createDailyNote(day));
  if (!daily) return;
  const link = app.fileManager.generateMarkdownLink(file, daily.path);
  await app.vault.process(daily, (c) => addLinkUnderHeading(c, s.dailyNoteHeading || "## Meetings", link));
}
