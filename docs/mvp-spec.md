# Pi Bot local agent workspace — current prototype specification

Status: implemented and verified as an Electron prototype.

## Goal

Let a person create or select an AI coding agent, choose the workspace it can operate in, and understand both its answer and the tool activity used to produce that answer.

## Primary task

Select an agent from the permanent rail, open or create an agent-scoped chat, send a message, and review the streamed response plus its command and tool activity.

## Shipped scope

- Local Electron app with a React/Vite renderer.
- Configurable agent profiles with name, initials, instructions, workspace, default model, reasoning level, and archive state.
- One isolated app-owned workspace by default for every agent; an external folder can be selected instead.
- Agent instructions persisted in the selected workspace's `AGENTS.md`.
- Skills loaded from `.agents/skills` only for trusted workspaces.
- Agent-scoped Pi `SessionManager` history, new chat, reopen chat, and permanent chat deletion.
- Session titles derived from the first prompt.
- Provider setup through API key, supported sign-in flow, or one-time Pi credential import during first setup.
- Provider disconnect and cancellable interactive sign-in prompts.
- Per-agent default model and per-session model selection.
- Supported reasoning-level selection and context-window usage.
- Streaming Markdown responses and Stop.
- Inline, collapsible Agent activity with the executed command, full command/output, and status.
- Compact composer that autosizes vertically for longer messages.
- Always-visible agent rail and collapsible session sidebar; no permanent right-side Context panel.
- Light and dark themes using shared design tokens.
- Visible loading, setup, unauthenticated, working, empty, error, and disabled states.

## Explicit non-goals

- Cloud sync, Pi Bot accounts, billing, or team collaboration.
- Browser automation, computer use, connectors, MCP, or arbitrary runtime extensions.
- Automatic multi-agent orchestration, agent-to-agent handoffs, background jobs, routines, or schedules.
- Attachments, generated artifact previews, Git workflow automation, or packaged auto-update distribution.
- A production sandbox or finished permission/approval policy.

## Product and data decisions

- The Electron main process owns Pi, models, credentials, files, sessions, and lifecycle.
- The renderer receives only the explicit API exposed by `electron/preload.cjs`.
- Each agent owns one current workspace and a separate session directory for each workspace identity.
- The app persists agent profiles and current-session mappings in Electron user data.
- App-owned workspaces are created below Electron user data with empty `AGENTS.md` and `.agents/skills/` paths.
- Switching an agent to an external workspace starts a new session and asks whether workspace skills may load.
- Archiving hides an agent from the rail. Restoring makes it selectable again.
- Deleting an agent removes its sessions. Its app-owned workspace is deleted only after separate confirmation; external folders are never deleted.
- Provider credentials are global. Agent default-model choices remain agent-specific.
- The light/dark preference is renderer-local under `pi-bot-theme`.

## Interface contract

- Left rail: permanent agent identity and global actions.
- Session sidebar: collapsible history scoped to the active agent.
- Main area: either chat or App Settings.
- Chat: user messages on the right, agent messages on the left, and tool/status events grouped as activity.
- Agent identity: the same initials and color appear in the rail, settings, messages, and working state.
- Activity: commands are visible in collapsed rows; expansion reveals Shell, full command, output, and outcome.
- Composer: compact with short input, vertical autosize for long input, maximum height `150px`.
- Typography: body and control text share a 14px base through semantic design tokens.

See [design-system.md](design-system.md) for the complete visual contract.

## Current security boundary

- `contextIsolation: true`; `nodeIntegration: false`.
- No direct Node/filesystem access from the renderer.
- Enabled Pi tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`.
- No sandbox and no allow/ask/deny approval layer yet.
- External-workspace trust gates `.agents/skills`, not `AGENTS.md`.
- Pi extensions, implicit context files, prompt templates, and runtime themes are disabled.

This boundary is suitable for a controlled local prototype, not untrusted autonomous execution.

## Acceptance criteria

1. `npm run typecheck` and `npm run build` pass.
2. First setup can connect a provider or import available Pi credentials; interactive provider prompts can be cancelled.
3. Agent create/edit/archive/restore/delete operations survive an app restart.
4. Agent identity, workspace, model, sessions, transcript, and avatar remain consistent when switching agents.
5. Sending a prompt creates one user message, streams one agent message, and records discrete tool activity.
6. Command activity exposes both the executed command and its output/status.
7. Stop ends streaming without leaving the composer busy.
8. The composer stays compact for short text and grows downward for multiline input.
9. The agent rail remains visible; only the session sidebar collapses.
10. Light mode uses a white chat canvas and both themes remain readable.
11. Closing and reopening the app restores the active agent and available session history.
12. Destructive session/agent operations require confirmation and external workspaces are preserved.

## Verification strategy

- TypeScript validation and Vite production build.
- Manual Electron QA for first setup, provider cancellation, theme switching, agent lifecycle, workspace trust, session lifecycle, long chats, activity disclosure, composer autosize, Stop, minimum window size, and restart persistence.
- Automated regression tests are not implemented yet and are part of the next-stage plan.

