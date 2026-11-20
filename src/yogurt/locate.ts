import { posix, win32 } from "path";

/** Yogurt's profile folder: Electron's appData + "Yogurt" (app/src/main/paths.ts). */
export function yogurtProfileDir(platform: string, env: Record<string, string | undefined>, home: string): string {
  if (platform === "win32") return win32.join(env.APPDATA || win32.join(home, "AppData", "Roaming"), "Yogurt");
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "Yogurt");
  return posix.join(env.XDG_CONFIG_HOME || posix.join(home, ".config"), "Yogurt");
}

export interface LocateInput {
  platform: string;
  env: Record<string, string | undefined>;
  home: string;
  /** reads a small text file, null when it isn't there */
  readFile: (path: string) => string | null;
  override?: string;
}

/**
 * Where Yogurt's MCP server listens: a Unix socket (Mac, Linux) or a named pipe whose name Yogurt writes to
 * mcp.pipe on every launch (Windows). address null: Yogurt has never run here.
 */
export function locateYogurt(i: LocateInput): { address: string | null } {
  const override = i.override?.trim();
  if (override) return { address: override };
  const dir = yogurtProfileDir(i.platform, i.env, i.home);
  if (i.platform === "win32") {
    const name = i.readFile(win32.join(dir, "mcp.pipe"))?.trim();
    return { address: name || null };
  }
  return { address: posix.join(dir, "mcp.sock") };
}
