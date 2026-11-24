# Yogurt Sync for Obsidian

Syncs meeting notes from [Yogurt](https://github.com/FrigadeHQ/yogurt), the private on-device meeting recorder, into your vault. It reads them through Yogurt's local MCP server, read-only. Desktop only.

## Installation

The plugin is not in the Obsidian community plugin directory yet. Install it from the [GitHub releases](https://github.com/akartmann/obsidian-yogurt/releases) in one of two ways.

### With BRAT (gets updates automatically)

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from **Settings → Community plugins → Browse**.
2. Run **BRAT: Add a beta plugin for testing** from the command palette and enter `akartmann/obsidian-yogurt`.
3. Enable **Yogurt Sync** under **Settings → Community plugins**.

### Manually

1. Download `yogurt-sync-<version>.zip` from the [latest release](https://github.com/akartmann/obsidian-yogurt/releases/latest).
2. Unzip it into your vault's plugin folder, so you end up with `<vault>/.obsidian/plugins/yogurt-sync/main.js` and `manifest.json`. (The `.obsidian` folder is hidden: press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> in the macOS Finder to show it.) You can also download `main.js` and `manifest.json` from the release individually and put them in that folder.
3. In Obsidian, open **Settings → Community plugins**, turn off Restricted mode if needed, click the refresh icon, and enable **Yogurt Sync**.

To update manually, replace the two files with the ones from the newer release and restart Obsidian.

## Setup

1. In Yogurt, open **Settings → AI apps** and turn access on.
2. Run **Yogurt Sync: Sync meetings now** from the command palette, or click the ribbon icon or the status bar item.

By default the plugin connects to Yogurt's socket (`~/Library/Application Support/Yogurt/mcp.sock` on macOS, `~/.config/Yogurt/mcp.sock` on Linux, or the pipe named in `%APPDATA%\Yogurt\mcp.pipe` on Windows). When Yogurt is closed, the sync is skipped quietly. To have Yogurt start in the background when needed, switch **Connection → Connect through** to the `yogurt-mcp` helper and paste the helper command from Yogurt's AI apps settings.

## What a note looks like

```markdown
---
yogurt-id: a80e…
date: 2026-11-20T12:01
end: 2026-11-20T13:27
attendees:
  - "[[Jane Doe]]"
calendar: Work
app: Teams
tags:
  - meeting
---
Anything you write here is yours.

<!-- yogurt:start -->
## Summary
…Yogurt's summary…

## My notes
…what you typed during the meeting…
<!-- yogurt:end -->

Anything you write here is yours too.
```

On every sync, only the part between the markers and the properties above are rewritten. Your own tags are kept. If you delete the markers, a fresh block is appended rather than overwriting anything. Notes are matched by `yogurt-id`, so you can rename and move them freely.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| Folder | `Meetings/{{date:YYYY}}/{{date:MM}}` | `{{date:FORMAT}}` uses moment.js formats; `{{title}}`, `{{calendar}}` and `{{app}}` also work |
| File name | `{{date:YYYY-MM-DD}} {{title}}` | Unsafe characters are removed; collisions get ` (2)` |
| Template | none | A note used as the body. `{{yogurt}}` marks where the synced block goes. Variables: `{{title}} {{date:…}} {{start:HH:mm}} {{end:HH:mm}} {{duration}} {{attendees}} {{attendeeLinks}} {{calendar}} {{app}} {{id}}` |
| Property prefix | none | e.g. `meeting-` gives `meeting-date` and `meeting-attendees` |
| People folder | none | When set, a person note (with `email`) is created for each new attendee. Existing notes are matched by `email`, name or alias |
| Leave out myself | none | Your names or emails, so you don't appear in every attendee list |
| Interval / lookback / re-check | 15 min / 30 days / 14 days | Yogurt has no "changed since" query, so recent meetings are re-read and compared by hash |

### Optional integrations (used automatically when present)

- **Templater**: run the template through Templater when a note is created.
- **Daily notes / Periodic Notes**: add a link to each new meeting under `## Meetings` in that day's note.
- **Bases / Dataview**: the **Create meetings dashboard** command writes a `Meetings.base` file (Bases) or a Dataview table note.

## Development

```bash
npm install
npm test        # vitest: rendering, block merge, MCP client against a fake Yogurt socket, sync engine
npm run build   # type-check and bundle to main.js
npm run dev     # watch mode
```

### Releasing

```bash
npm version patch   # or minor / major: bumps package.json, manifest.json and versions.json, commits and tags (e.g. 0.1.1)
git push --follow-tags
```

Pushing the tag runs [the release workflow](.github/workflows/release.yml): it checks the tag matches `manifest.json`, runs the tests, builds, and publishes a GitHub release with `main.js`, `manifest.json` and a `yogurt-sync-<version>.zip`. Tags have no `v` prefix, as Obsidian and BRAT expect. If you raise `minAppVersion`, edit it in `manifest.json` before running `npm version`.

Design: `docs/superpowers/specs/2026-11-20-yogurt-sync-design.md`.
