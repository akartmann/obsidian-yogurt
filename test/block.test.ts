import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START, placeInTemplate, replaceBlock, wrapBlock } from "../src/render/block";

const block = wrapBlock("new body");

describe("managed block", () => {
  it("wraps content between markers", () => {
    expect(block).toBe(`${BLOCK_START}\nnew body\n${BLOCK_END}`);
  });
  it("replaces only the managed region and keeps user text around it", () => {
    const note = `---\na: 1\n---\nmine before\n${BLOCK_START}\nold\n${BLOCK_END}\nmine after\n`;
    const r = replaceBlock(note, block);
    expect(r.replaced).toBe(true);
    expect(r.content).toBe(`---\na: 1\n---\nmine before\n${block}\nmine after\n`);
  });
  it("appends a block when markers are gone", () => {
    const r = replaceBlock("just my text\n", block);
    expect(r.replaced).toBe(false);
    expect(r.content).toBe(`just my text\n\n${block}\n`);
  });
  it("appends when markers are in the wrong order", () => {
    const r = replaceBlock(`${BLOCK_END}\nx\n${BLOCK_START}`, block);
    expect(r.replaced).toBe(false);
  });
  it("does not treat $ patterns in the block as replacement tokens", () => {
    const note = `${BLOCK_START}\nold\n${BLOCK_END}`;
    const b = wrapBlock("costs $& and $1");
    expect(replaceBlock(note, b).content).toBe(b);
  });
  it("places the block at {{yogurt}} or appends it", () => {
    expect(placeInTemplate("# T\n{{yogurt}}\nend", block)).toBe(`# T\n${block}\nend`);
    expect(placeInTemplate("# T\n", block)).toBe(`# T\n\n${block}\n`);
    expect(placeInTemplate("", block)).toBe(`${block}\n`);
  });
});
