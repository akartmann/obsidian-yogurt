import { describe, expect, it } from "vitest";
import moment from "moment";
import { buildBlockInner, buildProperties, contentHash, otherAttendees, templateVars } from "../src/render/note";
import { DEFAULT_SETTINGS } from "../src/settings-data";
import type { MeetingDetail } from "../src/types";

const fmt = (iso: string, f: string) => moment(iso).utc().format(f);
const m: MeetingDetail = {
  id: "m1", title: "Roadmap review", start: "2026-11-20T09:30:00.000Z", end: "2026-11-20T10:15:00.000Z",
  people: ["Ana", "Me Myself"], attendees: [{ name: "Ana", email: "ana@x.io" }, { name: "Me Myself", email: "me@x.io" }],
  app: "Zoom", recording: false,
  calendar_event: { title: "Roadmap", start: null, end: null, calendar: "Work" },
  myNotes: "- ask about Q1", summary: "## Plan\n<mine>ship it</mine>\n",
};

describe("block", () => {
  it("contains summary and my notes under their headings, without <mine> tags", () => {
    expect(buildBlockInner(m, DEFAULT_SETTINGS)).toBe("## Summary\n\n## Plan\nship it\n\n## My notes\n\n- ask about Q1");
  });
  it("omits disabled or empty sections", () => {
    const s = { ...DEFAULT_SETTINGS, includeSummary: false };
    expect(buildBlockInner({ ...m, myNotes: "  " }, s)).toBe("");
  });
});

describe("properties", () => {
  it("builds owned keys with prefix and links", () => {
    const p = buildProperties(m, { ...DEFAULT_SETTINGS, propertyPrefix: "meeting-" }, ["[[Ana]]"], fmt);
    expect(p).toEqual({
      "yogurt-id": "m1", "meeting-date": "2026-11-20T09:30", "meeting-end": "2026-11-20T10:15",
      "meeting-attendees": ["[[Ana]]"], "meeting-calendar": "Work", "meeting-app": "Zoom",
    });
  });
  it("excludes self by name or email", () => {
    expect(otherAttendees(m, "ME@x.io").map((a) => a.name)).toEqual(["Ana"]);
    expect(otherAttendees(m, "me myself").map((a) => a.name)).toEqual(["Ana"]);
    expect(otherAttendees(m, "").length).toBe(2);
  });
});

describe("vars and hash", () => {
  it("exposes template variables", () => {
    const v = templateVars(m, ["[[Ana]]"]);
    expect(v.title).toBe("Roadmap review");
    expect(v.duration).toBe("45 min");
    expect(v.attendeeLinks).toBe("[[Ana]]");
    expect(v.attendees).toBe("Ana, Me Myself");
  });
  it("hash changes when content changes and is stable otherwise", () => {
    const a = contentHash("x", { a: 1 });
    expect(contentHash("x", { a: 1 })).toBe(a);
    expect(contentHash("y", { a: 1 })).not.toBe(a);
  });
});
