# Obsidian plugin: Yogurt meeting sync

## Context
[Yogurt](https://github.com/FrigadeHQ/yogurt) is a local Electron app that records meetings and writes AI summaries on the device. The goal is to keep those meetings in an Obsidian vault as proper Obsidian notes: typed properties, links to people, configurable folder and file names, and optional integration with Templater, Dataview/Bases and Daily notes. Everything goes through Yogurt's MCP server; the plugin never reads Yogurt's internal files. `/Users/akartmann/Documents/Projects/obsidian-yogurt` is empty and not yet a git repository.

### Yogurt MCP facts (from the source, `app/src/main/mcp/{server,socket,paths}.ts`)
- Transport: MCP stdio framing, one JSON-RPC message per line, served on a **Unix socket** at `<profile>/mcp.sock` with mode 0600 (Mac: `~/Library/Application Support/Yogurt`, Linux: `$XDG_CONFIG_HOME/Yogurt` or `~/.config/Yogurt`). On Windows it's a **named pipe** whose name is written to `<profile>/mcp.pipe` (`%APPDATA%\Yogurt`) and changes on every launch. The `yogurt-mcp` helper bridges stdio to that socket and starts Yogurt hidden if it isn't running.
- No auth. Off until the user turns on Settings → AI apps. While it's off, every tool call returns `isError` with the text "turned off".
- Tools: `list_meetings{query?,limit≤100,before?ISO}` → `[{id,title,start,end,people,attendees[{name,email}],app,recording}]`, newest first. `get_meeting{id}` → the same fields plus `calendar_event{title,start,end,calendar}|null`, `myNotes`, `summary` (Markdown, may be empty until generated). Also `get_transcript`, `search` and `get_audio`, which v1 doesn't use.
- There is **no updated-since filter and no modified timestamp**, so changes are found by hashing the content.

## Decisions (user)
- Re-sync only rewrites a **managed block** (`<!-- yogurt:start -->…<!-- yogurt:end -->`) and the properties the plugin owns. Everything else in the note belongs to the user.
- Content: **AI summary + my typed notes**. No transcript or audio in v1.
- Attendees appear as **wikilinks** (`[[Jane Doe]]`). Person notes can optionally be created.
- Integrations are **optional and detected at runtime**: Templater, Dataview/Bases and Daily notes each light up when installed. The plugin falls back to its built-in `{{var}}` templates.
- Connection: **direct socket/pipe by default**. Sync is skipped quietly when Yogurt isn't running. An advanced setting switches to the `yogurt-mcp` helper command.
- Desktop only (`isDesktopOnly: true`, since it needs Node `net` and `child_process`).

## Approach
TypeScript plugin built from the official `obsidian-sample-plugin` layout (esbuild, `manifest.json`, `versions.json`). The MCP client uses `@modelcontextprotocol/sdk`'s `Client`: a small custom `Transport` over `net.Socket` (newline-delimited JSON) for the default mode, and `StdioClientTransport` for the helper mode. Pure logic (rendering, paths, block merge, hashing) stays free of Obsidian imports so it can be unit-tested with vitest.

### Module layout (`src/`)
- `main.ts`: plugin lifecycle; ribbon icon and commands (`Sync now`, `Full resync`, `Create meetings dashboard`, `Open meeting note for…`); interval via `registerInterval`; sync on layout-ready; status bar item.
- `settings.ts`: `PluginSettingTab` with an `AbstractInputSuggest` folder/file picker and a live preview of the resolved path for the newest meeting.
- `yogurt/locate.ts`: per-OS profile dir → socket path, or pipe name read from `mcp.pipe`. Can be overridden in settings.
- `yogurt/transport.ts`: `SocketTransport implements Transport`. `yogurt/client.ts`: connect, `listMeetings(before)`, `getMeeting(id)`, typed parsing of the `content[0].text` JSON, and mapping errors to `NotRunning | Disabled | Failed`.
- `sync/engine.ts`: the algorithm below. `sync/index.ts`: maps `yogurt-id` → `TFile` by scanning `metadataCache` frontmatter, so it survives renames and moves.
- `render/template.ts`: `{{var}}` and `{{date:FORMAT}}` substitution using `moment` (exported by obsidian) and filename sanitizing. `render/note.ts`: builds the frontmatter object and the managed block. `render/block.ts`: replaces or inserts the managed block.
- `integrations/templater.ts`, `integrations/dailyNotes.ts` (uses `obsidian-daily-notes-interface`, which supports the core plugin and Periodic Notes), `integrations/dashboard.ts` (Bases `.base` if core Bases is enabled, otherwise a Dataview query note if Dataview is installed), `integrations/people.ts`.

### Settings (defaults)
- Folder pattern `Meetings/{{date:YYYY}}/{{date:MM}}`, file name pattern `{{date:YYYY-MM-DD}} {{title}}` (name collisions get ` (2)`).
- Note template: a vault file path (optional). Without one, a built-in template is used. Template variables: `title, date, start, end, duration, attendees, attendeeLinks, calendar, app, id, summary, myNotes`. The managed block goes where `{{yogurt}}` appears in the template, or is appended when the placeholder is missing.
- Use Templater for the template on note creation (shown only when Templater is installed).
- Sections in the block: summary on/off, my notes on/off, and heading text for each.
- Properties: prefix (none by default). Owned keys: `yogurt-id`, `date` (date-time), `end`, `attendees` (list of `[[Name]]`), `calendar`, `app`, `tags` (merged with `meeting`, never removed), `yogurt-hash`.
- People: link style (wikilink or plain), people folder (empty means no person notes are created), match an existing person note by `email` property or alias before creating a new one, and exclude myself (by name or email).
- Daily notes: append a link under heading `## Meetings` (on/off, heading text). Shown only when Daily notes or Periodic Notes is available.
- Sync: on startup, interval in minutes (default 15, 0 = off), initial lookback in days (default 30), rolling re-check window in days (default 14).
- Connection: socket (auto-detected path, overridable) or helper command path.

### Sync algorithm
1. Connect. If Yogurt isn't running or access is disabled, show a status-bar hint (and a `Notice` only for a manual sync), then stop.
2. Page through `list_meetings{limit:100,before}` back to `max(lookback cutoff, now − re-check window)`. A full resync goes back to the lookback cutoff, or to "all" when it's set to 0. The first run uses the lookback window.
3. Skip `recording: true`. For each remaining meeting, call `get_meeting`. Skip it, and retry next run, when both summary and myNotes are empty.
4. Render the frontmatter and the block, then compute `hash = sha1(block + owned props)`.
   - **No note** (by `yogurt-id`): resolve folder and file name → `vault.createFolder` as needed → body = template (Templater: create the file then `write_template_to_file`; built-in: substitute) → insert the block → `vault.create` → `fileManager.processFrontMatter` for owned keys. Then add the daily-note link and person notes if enabled.
   - **Note exists and the hash differs**: `vault.process(file, replaceBlock)` and `processFrontMatter` (only owned keys are touched; `tags` are merged). The note is never moved or renamed after creation.
   - **Hash equal**: skip.
   - **Block markers missing** (user deleted them): append a fresh block and log it. No data is lost.
5. Persist `{lastSync, synced: {id: hash}}` through `saveData`, and show a summary such as "3 new, 1 updated".
- A lock prevents overlapping runs. Meetings trashed in Yogurt are never deleted from the vault (non-goal).

### Non-goals (v1)
Transcripts, audio, writing back to Yogurt, mobile support, deleting notes.

## Steps
1. `git init`, save this design to `docs/superpowers/specs/2026-11-20-yogurt-sync-design.md`, scaffold from obsidian-sample-plugin, add vitest.
2. Write the pure modules with TDD: `render/template`, `render/block`, `render/note`, `yogurt/locate`.
3. MCP client and `SocketTransport`, tested against a fake newline-JSON socket server that mimics Yogurt's replies, including the disabled and refusal cases.
4. Sync engine with an in-memory vault fake (create, update, unchanged, markers missing, collision, recording skip, empty-summary retry).
5. Settings tab, commands, interval and status bar.
6. Integrations: people, daily notes, Templater, dashboard (each guarded by detection).
7. README (setup: enable Yogurt → Settings → AI apps), stage everything, and hand over the commit message (the user commits, per their convention).

## Verification
- `npm test` (vitest) passes; `npm run build` produces `main.js` with no type errors.
- Fixture run: a script starts the fake Yogurt socket server, and the engine is run against a temp vault folder to check the paths, frontmatter and block contents.
- Real run: symlink the build into a test vault's `.obsidian/plugins/yogurt-sync`, enable Yogurt → Settings → AI apps, run "Sync now", and check that notes appear under `Meetings/YYYY/MM` with linked attendees. Add text outside the block and re-sync: the text is kept. Quit Yogurt: the sync is skipped quietly. With Templater, Daily notes or Dataview enabled or disabled, each integration activates or hides accordingly.

## Implementation notes (deviations from the plan)
- The `@modelcontextprotocol/sdk` client was replaced by a minimal newline-JSON-RPC client (`src/yogurt/rpc.ts`). Yogurt only needs `initialize` and `tools/call`, and this keeps the SDK, zod and ajv out of the bundle (main.js is about 32 KB).
- `yogurt-hash` is not written to frontmatter. Hashes live in the plugin's `data.json` (`state.synced`), so notes stay free of internal properties.
- A note the person deleted is not recreated unless "Recreate notes I deleted" is on, or on a full resync.
