import { describe, expect, it } from "vitest";
import moment from "moment";
import { renderTemplate, sanitizeFileName, sanitizeFolder, type DateFormatter } from "../src/render/template";

const fmt: DateFormatter = (iso, f) => moment(iso).utc().format(f);
const dates = { date: "2026-11-20T09:30:00.000Z", start: "2026-11-20T09:30:00.000Z", end: "2026-11-20T10:00:00.000Z" };

describe("renderTemplate", () => {
  it("substitutes plain variables and formatted dates", () => {
    const out = renderTemplate("{{date:YYYY}}/{{date:MM}}/{{title}}", { title: "Weekly sync" }, dates, fmt);
    expect(out).toBe("2026/11/Weekly sync");
  });
  it("uses default formats for bare date variables", () => {
    expect(renderTemplate("{{date}} {{start}}-{{end}}", {}, dates, fmt)).toBe("2026-11-20 09:30-10:00");
  });
  it("leaves unknown placeholders and Templater syntax alone", () => {
    expect(renderTemplate("{{yogurt}} <% tp.date.now() %> {{nope}}", {}, dates, fmt)).toBe("{{yogurt}} <% tp.date.now() %> {{nope}}");
  });
  it("renders empty string for a date that is missing", () => {
    expect(renderTemplate("[{{end:HH:mm}}]", {}, { ...dates, end: null }, fmt)).toBe("[]");
  });
  it("tolerates spaces inside braces", () => {
    expect(renderTemplate("{{ title }}", { title: "A" }, dates, fmt)).toBe("A");
  });
});

describe("sanitize", () => {
  it("removes characters Obsidian forbids in file names", () => {
    expect(sanitizeFileName('Q4: plan / "budget" #1 [draft]?')).toBe("Q4 plan budget 1 draft");
  });
  it("falls back when nothing is left", () => {
    expect(sanitizeFileName("///")).toBe("Untitled meeting");
  });
  it("keeps folder separators but cleans segments", () => {
    expect(sanitizeFolder("/Meetings//2026/ 11: x /")).toBe("Meetings/2026/11 x");
  });
  it("trims trailing dots and caps length", () => {
    expect(sanitizeFileName("a".repeat(300) + "...").length).toBe(120);
  });
});

import { fixedFolder } from "../src/render/template";
describe("fixedFolder", () => {
  it("keeps only whole segments before the first placeholder", () => {
    expect(fixedFolder("Meetings/{{date:YYYY}}/{{date:MM}}")).toBe("Meetings");
    expect(fixedFolder("Work/Meetings/Y{{date:YYYY}}")).toBe("Work/Meetings");
    expect(fixedFolder("{{date:YYYY}}")).toBe("");
    expect(fixedFolder("Meetings")).toBe("Meetings");
  });
});
