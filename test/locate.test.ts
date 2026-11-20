import { describe, expect, it } from "vitest";
import { locateYogurt, yogurtProfileDir } from "../src/yogurt/locate";

describe("locate", () => {
  it("mac profile", () => {
    expect(yogurtProfileDir("darwin", {}, "/Users/a")).toBe("/Users/a/Library/Application Support/Yogurt");
  });
  it("linux honours XDG_CONFIG_HOME", () => {
    expect(yogurtProfileDir("linux", { XDG_CONFIG_HOME: "/cfg" }, "/home/a")).toBe("/cfg/Yogurt");
    expect(yogurtProfileDir("linux", {}, "/home/a")).toBe("/home/a/.config/Yogurt");
  });
  it("socket path on mac and linux", () => {
    expect(locateYogurt({ platform: "darwin", env: {}, home: "/Users/a", readFile: () => null }))
      .toEqual({ address: "/Users/a/Library/Application Support/Yogurt/mcp.sock" });
  });
  it("windows reads the pipe name, which changes each launch", () => {
    const r = locateYogurt({ platform: "win32", env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, home: "C:\\Users\\a",
      readFile: (p) => (p === "C:\\Users\\a\\AppData\\Roaming\\Yogurt\\mcp.pipe" ? "\\\\.\\pipe\\yogurt-mcp-abc\n" : null) });
    expect(r).toEqual({ address: "\\\\.\\pipe\\yogurt-mcp-abc" });
  });
  it("windows without a pipe file means Yogurt never ran", () => {
    const r = locateYogurt({ platform: "win32", env: { APPDATA: "C:\\R" }, home: "C:\\U", readFile: () => null });
    expect(r).toEqual({ address: null });
  });
  it("an override wins", () => {
    expect(locateYogurt({ platform: "darwin", env: {}, home: "/x", readFile: () => null, override: " /tmp/s.sock " }))
      .toEqual({ address: "/tmp/s.sock" });
  });
});
