export type ConnectionMode = "socket" | "helper";

export interface YogurtSettings {
  // Where notes go
  folderPattern: string;
  fileNamePattern: string;
  templatePath: string;
  useTemplater: boolean;
  // Managed block
  includeSummary: boolean;
  summaryHeading: string;
  includeMyNotes: boolean;
  myNotesHeading: string;
  // Properties
  propertyPrefix: string;
  tags: string;
  // People
  linkAttendees: boolean;
  peopleFolder: string;
  excludeSelf: string;
  // Daily notes
  dailyNoteLink: boolean;
  dailyNoteHeading: string;
  // Sync
  syncOnStartup: boolean;
  intervalMinutes: number;
  lookbackDays: number;
  recheckDays: number;
  recreateDeleted: boolean;
  // Connection
  connection: ConnectionMode;
  socketPath: string;
  helperPath: string;
}

export const DEFAULT_SETTINGS: YogurtSettings = {
  folderPattern: "Meetings/{{date:YYYY}}/{{date:MM}}",
  fileNamePattern: "{{date:YYYY-MM-DD}} {{title}}",
  templatePath: "",
  useTemplater: false,
  includeSummary: true,
  summaryHeading: "## Summary",
  includeMyNotes: true,
  myNotesHeading: "## My notes",
  propertyPrefix: "",
  tags: "meeting",
  linkAttendees: true,
  peopleFolder: "",
  excludeSelf: "",
  dailyNoteLink: false,
  dailyNoteHeading: "## Meetings",
  syncOnStartup: true,
  intervalMinutes: 15,
  lookbackDays: 30,
  recheckDays: 14,
  recreateDeleted: false,
  connection: "socket",
  socketPath: "",
  helperPath: "",
};

/** What the plugin remembers between runs (stored next to the settings in data.json). */
export interface SyncState {
  lastSync: string | null;
  /** yogurt id → hash of what was last written */
  synced: Record<string, string>;
}

export const EMPTY_STATE: SyncState = { lastSync: null, synced: {} };

export const splitList = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);
