# Pi Bot

Pi Bot is a local-first desktop workspace for chatting with configurable AI coding agents powered by `@earendil-works/pi-coding-agent`.

## Public Alpha

`v0.1.5` is a macOS Apple Silicon (`arm64`) and Windows x64 Public Alpha. It has no auto-update mechanism and no per-action approval policy. Use it only with a workspace you intentionally selected and can recover.

## Install

1. Download `PiBot-0.1.5-arm64.dmg` and its SHA-256 checksum from the [v0.1.5 release](https://github.com/rahmanramsi/pi-bot/releases/tag/v0.1.5).
2. Optionally verify the download with `shasum -a 256 PiBot-0.1.5-arm64.dmg`.
3. Open the DMG and drag Pi Bot to Applications.
4. If macOS blocks the first launch, open **System Settings → Privacy & Security**, then click **Open Anyway** for Pi Bot.
5. On first setup, acknowledge the execution warning, connect a supported provider, and choose a workspace.

On Windows, download and run `PiBot-0.1.5-x64-setup.exe` from the same release. The installer is unsigned, so Windows may require you to approve the first launch.

## What it does

- Create, edit, archive, restore, and delete agent profiles.
- Assign one app-owned or external workspace to each agent.
- Store agent instructions in the workspace `AGENTS.md` file.
- Load optional workspace skills from `.agents/skills` after the workspace is trusted.
- Keep persistent agent-scoped chat sessions with first-prompt titles.
- Stream Markdown responses while model reasoning, progress updates, and tool activity stay grouped under one flat `Working for …` disclosure.
- Use a titleless, resizable right sidebar where users add filterable Files or private Browser tabs that the active chat agent can operate through normal page UI.
- Connect providers through API keys, supported sign-in flows, or a one-time Pi credential import.
- Store provider credentials in a permission-restricted local app file.

## Execution warning

Pi Bot gives the agent `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, and a Browser tool for the active chat session. The agent can run commands, modify or delete files in the selected workspace, and operate visible Browser UI without asking for approval for each action. Pi Bot has no sandbox yet.

The initial setup requires a one-time acknowledgement of this risk. It is a disclosure, not an approval system. Do not use Pi Bot with a workspace whose contents you cannot safely change.

## Privacy

Pi Bot stores settings, session mappings, agent/workspace-scoped sessions, app-owned workspaces, and model-provided reasoning in `pi-bot.sqlite` under Electron's app-data directory. Provider credentials remain in the separate permission-restricted `credentials.json`; they are not part of the database migration. New installs do not create settings or session JSONL. Existing installs migrate validated legacy files without deleting them automatically. See [storage, migration, and recovery](docs/storage-and-migration.md) for the layout and cleanup procedure. The app has no built-in telemetry, analytics, crash reporting, or cloud sync.

Prompts, workspace context, and tool results needed by an agent are sent to the model provider you connect. That provider's privacy policy applies to its handling of that data.

The Browser uses its own local profile per chat session. It blocks downloads, popups, site permissions, and non-HTTP(S) navigation. Agents can read visible page content and use normal controls in tabs owned by the active chat session, but never receive cookies, local storage, passwords, or credential APIs. Manual sign-in remains user-controlled.

The Browser tool starts with `tabs` to discover the active chat's opaque tab IDs. Use `read` for visible page content and stable control targets, then `navigate`, `click`, `type`, or `submit`; hidden/disabled controls and page failures return stable redacted errors, and typed values never appear in activity summaries.

## Run from source

Requirements: Node.js 22.19 or newer and a supported provider credential (or importable local Pi credentials). The published Public Alpha currently targets macOS on Apple Silicon. Validate the Windows installer on Windows before publishing it.

```bash
npm install
npm run dev
```

Validation and release build:

```bash
npm run typecheck
npm run build
npm run dist
```

`npm run dist` creates `release/PiBot-0.1.5-arm64.dmg`.

To create a Windows x64 installer:

```bash
npm install
npm run dist:win
npm run smoke:packaged
```

This creates `release/PiBot-0.1.5-x64-setup.exe`.

Before publishing a Windows build, run `npm run smoke:packaged` from Windows.

## Report a bug

Open an issue at [github.com/rahmanramsi/pi-bot/issues](https://github.com/rahmanramsi/pi-bot/issues). Include your Pi Bot version, operating-system version, whether the app is running from an installer, steps to reproduce, and any non-secret error text.

## Development notes

The release gate runs TypeScript validation, a production build, an asset-path check, and `npm run smoke:packaged`, which opens the packaged app through first setup. A provider connection, agent creation, workspace selection, one prompt/tool run, and restart/session persistence still require a credentialed manual test.

## License

[MIT](LICENSE)
