# Pi Bot

Pi Bot is a local-first macOS workspace for chatting with configurable AI coding agents powered by `@earendil-works/pi-coding-agent`.

## Public Alpha

`v0.1.0` is an unsigned Apple Silicon (`arm64`) Public Alpha. It has no auto-update mechanism and no per-action approval policy. Use it only with a workspace you intentionally selected and can recover.

## Install

1. Download `Pi-Bot-0.1.0-arm64.dmg` and its SHA-256 checksum from the [v0.1.0 release](https://github.com/rahmanramsi/pi-bot/releases/tag/v0.1.0).
2. Optionally verify the download with `shasum -a 256 Pi-Bot-0.1.0-arm64.dmg`.
3. Open the DMG and drag Pi Bot to Applications.
4. Because the app is unsigned, Control-click Pi Bot in Applications, choose **Open**, then confirm **Open** in the macOS prompt.
5. On first setup, acknowledge the execution warning, connect a supported provider, and choose a workspace.

## What it does

- Create, edit, archive, restore, and delete agent profiles.
- Assign one app-owned or external workspace to each agent.
- Store agent instructions in the workspace `AGENTS.md` file.
- Load optional workspace skills from `.agents/skills` after the workspace is trusted.
- Keep persistent agent-scoped chat sessions with first-prompt titles.
- Stream Markdown responses, tool activity, model selection, and reasoning-level selection.
- Connect providers through API keys, supported sign-in flows, or a one-time Pi credential import.
- Store provider credentials in Electron `safeStorage` when available, otherwise in a permission-restricted app file.

## Execution warning

Pi Bot gives the agent `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`. The agent can run commands and modify or delete files in the selected workspace without asking for approval for each action. Pi Bot has no sandbox yet.

The initial setup requires a one-time acknowledgement of this risk. It is a disclosure, not an approval system. Do not use Pi Bot with a workspace whose contents you cannot safely change.

## Privacy

Pi Bot stores its settings, session mappings, app-owned workspaces, and credentials locally in Electron's app-data directory. The app has no built-in telemetry, analytics, crash reporting, or cloud sync.

Prompts, workspace context, and tool results needed by an agent are sent to the model provider you connect. That provider's privacy policy applies to its handling of that data.

## Run from source

Requirements: macOS on Apple Silicon, Node.js 22.19 or newer, and a supported provider credential (or importable local Pi credentials).

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

`npm run dist` creates `release/Pi-Bot-0.1.0-arm64.dmg`.

## Report a bug

Open an issue at [github.com/rahmanramsi/pi-bot/issues](https://github.com/rahmanramsi/pi-bot/issues). Include your Pi Bot version, macOS version, whether the app is running from the DMG, steps to reproduce, and any non-secret error text.

## Development notes

There is no automated test suite yet. The release gate is TypeScript validation, a production build, and a manual smoke test from the exact DMG being released: first setup, provider connection, agent creation, workspace selection, one prompt/tool run, and restart/session persistence.

## License

[MIT](LICENSE)
