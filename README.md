# Pi Bot

Pi Bot is a local-first Electron workspace for chatting with configurable AI coding agents powered by `@earendil-works/pi-coding-agent`.

The project is currently a desktop prototype. It keeps the agent runtime, filesystem access, sessions, and credentials in the Electron main process while the React renderer communicates through a narrow IPC bridge.

## Current features

- Create, edit, archive, restore, and delete agent profiles.
- One app-owned or external workspace per agent.
- Agent instructions stored in the workspace `AGENTS.md` file.
- Optional workspace skills loaded from `.agents/skills` after the workspace is trusted.
- Persistent agent-scoped chat sessions with first-prompt titles.
- Streaming Markdown responses, Stop, model selection, and reasoning-level selection.
- Inline activity groups with the executed command, output, and completion state.
- Provider setup through API keys, supported provider sign-in flows, or a one-time Pi credential import during first setup.
- Light and dark themes with a shared typography and component-token system.

## Requirements

- Node.js 22.19 or newer.
- A provider credential supported by the bundled Pi model runtime, or importable local Pi credentials during first setup.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts Vite at `http://127.0.0.1:5173` and opens the Electron window after the renderer is ready.

Validation commands:

```bash
npm run typecheck
npm run build
```

There is no automated test command yet.

## Interface

The app uses three permanent layers:

1. An always-visible agent rail.
2. A collapsible session sidebar scoped to the active agent.
3. The chat or App Settings workspace.

The chat keeps human messages on the right and agent messages on the left. Consecutive tool and status events are grouped as **Agent activity**. Command activity shows the exact command in the collapsed summary and exposes the full command, output, and outcome when expanded.

The composer is compact at rest and grows vertically as the message becomes longer, up to its maximum height.

## Local data

Electron stores application data below its platform-specific `userData` directory:

- `settings.json` — agents, active agent, preferences, and session mappings.
- `credentials.bin` — provider credentials encrypted with Electron `safeStorage` when available; otherwise stored in a permission-restricted app file.
- `agents/<agent-id>/` — default app-owned workspaces with `AGENTS.md` and `.agents/skills/`.
- `sessions/<agent-id>/<workspace-hash>/` — Pi session history for an agent/workspace pair.

Deleting a session is permanent. Deleting an agent removes its sessions; its app-owned workspace is removed only after separate confirmation. External workspace folders are never deleted by agent deletion.

## Security boundary

- `contextIsolation` is enabled and `nodeIntegration` is disabled.
- The renderer has no direct Node or filesystem access.
- Pi currently receives `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`.
- The prototype does **not** yet provide a sandbox or an allow/ask/deny approval policy for those tools.
- Trusting an external workspace controls loading `.agents/skills`; its `AGENTS.md` is still loaded.
- Extensions, prompt templates, themes, and implicit context files from the Pi runtime are disabled.

Use a disposable or intentionally selected workspace until the permission layer is implemented.

## Project structure

```text
electron/main.mjs       Pi runtime, agents, sessions, providers, persistence, IPC
electron/preload.cjs    narrow renderer bridge
src/App.tsx             renderer state and application surfaces
src/styles.css          themes, layout, and design tokens
src/components/ui/      shared UI primitives
src/types.ts            renderer and IPC contracts
public/branding/        application logo assets
docs/                   product specs and research notes
```

## Documentation

- [Current prototype specification](docs/mvp-spec.md)
- [Next-stage specification](docs/next-stage-spec.md)
- [Design system](docs/design-system.md)
- [Chat and activity UX research](docs/chat-ux-research.md)
- [Grok Bot product research](docs/grok-research.md)
- [Agent harness catalog](docs/agent-harness-catalog.md)

