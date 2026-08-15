# Pi Bot local agent workspace — Public Alpha specification

Status: implemented as a macOS Apple Silicon Public Alpha.

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
- Supported reasoning-level selection, model-provided reasoning grouped inside the per-turn working disclosure, and context-window usage.
- Streaming Markdown responses and Stop.
- One flat collapsible `Working for …` disclosure per user turn containing reasoning and progress as aligned narrative text plus compact summaries for consecutive tool calls; full command/output remains inspectable.
- Compact composer that autosizes vertically for longer messages.
- One collapsible left sidebar containing agent selection and active-agent session history; no permanent right-side Context panel.
- A resizable right workspace with Files and session-scoped Browser tabs. The active chat agent can discover its Browser tabs with `tabs`, read visible page content, and use normal visible controls through `click`, `type`, and `submit`.
- Light and dark themes using shared design tokens.
- Visible loading, setup, unauthenticated, working, empty, error, and disabled states.

## Explicit non-goals

- Cloud sync, Pi Bot accounts, billing, or team collaboration.
- Broad computer use, unrestricted browser automation, connectors, MCP, or arbitrary runtime extensions. Browser support is limited to the narrow visible-page tool described below.
- Automatic multi-agent orchestration, agent-to-agent handoffs, background jobs, routines, or schedules.
- Attachments, generated artifact previews, Git workflow automation, or auto-update distribution.
- A production sandbox or finished permission/approval policy.

## Product and data decisions

- The Electron main process owns Pi, models, credentials, files, sessions, and lifecycle.
- The renderer receives only the explicit API exposed by `electron/preload.cjs`.
- Browser guests are created by the main process from `did-attach-webview`; before mounting, the renderer asks main for a collision-resistant persistent partition derived from the active session and tab. Registration accepts only opaque tab/session values and binds the already-attached guest whose actual partition matches that main-issued per-tab partition; no token is sent through the page URL, `name`, or renderer web contents ID.
- Each agent owns one current workspace and a separate session directory for each workspace identity.
- The app persists agent profiles and current-session mappings in Electron user data.
- App-owned workspaces are created below Electron user data with empty `AGENTS.md` and `.agents/skills/` paths.
- Switching an agent to an external workspace starts a new session and asks whether workspace skills may load.
- Archiving hides an agent from the combined sidebar. Restoring makes it selectable again.
- Deleting an agent removes its sessions. Its app-owned workspace is deleted only after separate confirmation; external folders are never deleted.
- Provider credentials are global. Agent default-model choices remain agent-specific.
- The light/dark preference is renderer-local under `pi-bot-theme`.
- First setup requires a one-time acknowledgement that the agent can run commands and modify files without per-action approval.

## Interface contract

- Left app sidebar: agent identity, global actions, and collapsible history scoped to the active agent.
- Main area: either chat or App Settings.
- Chat: user messages on the right; reasoning, progress updates, and tool/status events grouped in one flat `Working for …` disclosure; only the final agent response remains in the main conversation.
- Agent identity: the same initials and color appear in the rail, settings, messages, and working state.
- Activity: commands are visible in collapsed rows; expansion reveals Shell, full command, output, and outcome.
- Composer: compact with short input, vertical autosize for long input, maximum height `150px`.
- Typography: body and control text share a 14px base through semantic design tokens.

See [design-system.md](design-system.md) for the complete visual contract.

## Current security boundary

- `contextIsolation: true`; `nodeIntegration: false`.
- No direct Node/filesystem access from the renderer.
- Enabled Pi tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, and `browser`.
- The `browser` tool accepts `tabs`, `read`, `navigate`, `click`, `type`, and `submit`. It is scoped to the active agent/chat session, returns stable targets from `read`, and rejects hidden or disabled controls at execution time.
- Browser IPC never accepts a renderer `webContents` ID or arbitrary guest attachment. The main process derives a stable collision-resistant partition and exposes only that opaque value through bootstrap. Main-process activity summaries and tool failures use redacted, action-specific text.
- No sandbox and no allow/ask/deny approval layer yet.
- External-workspace trust gates `.agents/skills`, not `AGENTS.md`.
- Pi extensions, implicit context files, prompt templates, and runtime themes are disabled.

This Public Alpha boundary is not suitable for untrusted autonomous execution.

## Acceptance criteria

1. `npm run typecheck` and `npm run build` pass.
2. First setup can connect a provider or import available Pi credentials; interactive provider prompts can be cancelled.
3. Agent create/edit/archive/restore/delete operations survive an app restart.
4. Agent identity, workspace, model, sessions, transcript, and avatar remain consistent when switching agents.
5. Sending a prompt creates one user message, groups the agent process in one activity disclosure, and streams the final agent response separately.
6. Command activity exposes both the executed command and its output/status.
7. Stop ends streaming without leaving the composer busy.
8. The composer stays compact for short text and grows downward for multiline input.
9. The combined left sidebar collapses and reopens from the control beside the native window controls.
10. Light mode uses a white chat canvas and both themes remain readable.
11. Closing and reopening the app restores the active agent and available session history.
12. Destructive session/agent operations require confirmation and external workspaces are preserved.
13. Browser actions discover only tabs in the active chat session, operate visible normal controls, and keep typed values out of tool activity and failure messages.

## Verification strategy

- TypeScript validation and Vite production build.
- Manual Electron QA for first setup, provider cancellation, theme switching, agent lifecycle, workspace trust, session lifecycle, long chats, activity disclosure, composer autosize, Stop, minimum window size, and restart persistence.
- `npm test` covers persistence, renderer contracts, and Browser session/DOM behavior; Electron manual QA still covers the complete packaged surface.
