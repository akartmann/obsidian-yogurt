import { describe, expect, it } from "vitest";
import { addLinkUnderHeading } from "../src/render/daily";

describe("addLinkUnderHeading", () => {
  it("adds heading and link when missing", () => {
    expect(addLinkUnderHeading("# Fri\n\ntext\n", "## Meetings", "[[A]]")).toBe("# Fri\n\ntext\n\n## Meetings\n- [[A]]\n");
  });
  it("appends after existing items under the heading, before the next section", () => {
    const note = "## Meetings\n- [[A]]\n\n## Tasks\n- x\n";
    expect(addLinkUnderHeading(note, "## Meetings", "[[B]]")).toBe("## Meetings\n- [[A]]\n- [[B]]\n\n## Tasks\n- x\n");
  });
  it("is idempotent", () => {
    const note = "## Meetings\n- [[A]]\n";
    expect(addLinkUnderHeading(note, "## Meetings", "[[A]]")).toBe(note);
  });
  it("works on an empty note", () => {
    expect(addLinkUnderHeading("", "## Meetings", "[[A]]")).toBe("## Meetings\n- [[A]]\n");
  });
  it("heading at end of file without newline", () => {
    expect(addLinkUnderHeading("## Meetings", "## Meetings", "[[A]]")).toBe("## Meetings\n- [[A]]\n");
  });
});
