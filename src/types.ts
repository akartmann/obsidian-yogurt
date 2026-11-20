/** Shapes returned by Yogurt's MCP tools (app/src/main/mcp/server.ts in FrigadeHQ/yogurt). */
export interface Attendee {
  name: string;
  email: string | null;
}

export interface MeetingSummary {
  id: string;
  title: string;
  /** ISO time */
  start: string | null;
  end: string | null;
  people: string[];
  attendees: Attendee[];
  /** the call app (Zoom, Meet, …) */
  app: string | null;
  recording: boolean;
}

export interface CalendarEvent {
  title: string | null;
  start: string | null;
  end: string | null;
  calendar: string | null;
}

export interface MeetingDetail extends MeetingSummary {
  calendar_event: CalendarEvent | null;
  /** what the person typed during the meeting */
  myNotes: string | null;
  /** Yogurt's Markdown summary; null until written */
  summary: string | null;
}
