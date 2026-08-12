# Pi Bot Agent Conversation Workspace MVP

## Goal

Turn the selected Agent Conversation Workspace design into a small, local-first Electron app that lets a person choose a read-only Pi teammate and talk to it while keeping the work anchored to a folder on their computer.

## Primary task

Choose Planner, Researcher, or Coder in the sidebar, ask that agent a question about the selected workspace, and see the answer stream in place, including the read-only tools Pi uses.

## MVP scope

- One agent-first Conversation Workspace interface (variant A).
- Planner, Researcher, and Coder agent navigation in the primary sidebar.
- A separate real Pi SDK session with streaming assistant text for each selected agent.
- Persistent Pi session history per workspace and agent.
- New chat, secondary history selection, and session titles derived from the first prompt.
- Native folder selection and remembered last workspace.
- Model selection and thinking-level selection.
- Read-only tool activity for `read`, `grep`, `find`, and `ls`.
- Stop while a response is streaming.
- Visible loading, empty, no-model, and error states.
- Local Electron/Vite build and manual QA against a real model.

## Explicit non-goals

- Cloud sync, accounts, billing, team collaboration, or web deployment.
- File writes, shell execution, browser automation, or arbitrary extensions.
- Automatic multi-agent orchestration, agent-to-agent handoffs, and custom agent creation.
- Provider/API-key management. Pi's existing local authentication remains the source of available models.

## Product decisions

- Pi runs locally through the Electron main process and SDK; the renderer never receives Node access.
- The selected workspace is the session's `cwd` and is persisted in Electron's user-data directory.
- The sidebar is primarily agent navigation. History is a collapsible secondary surface scoped to the selected agent.
- Each agent has its own persistent `SessionManager` session for the selected workspace and can be reopened from history.
- Pi's persistent `SessionManager` is the source of truth for history. The renderer only keeps the current view state.
- A session is created lazily for a new chat and can be reopened from the selected agent's history list.
- Tools are read-only by construction. The UI states this in the context panel.

## Acceptance criteria

1. `npm run build` passes from a clean checkout.
2. Launching the app resumes the last selected agent and its session for the remembered workspace, or shows an actionable empty state.
3. Selecting Planner, Researcher, or Coder changes the active agent, conversation transcript, and agent shown in Context.
4. Sending a prompt creates a user row, streams an assistant row for the selected agent, and shows tool start/update/end rows when tools run.
5. Stop ends the active generation without leaving the composer stuck in a busy state.
6. Closing and reopening the app keeps the workspace, selected agent, and each agent's session history available.
7. Expanding History shows only sessions for the selected agent; opening an item restores its transcript and New chat starts a separate persistent session.
8. Changing model or thinking level affects the active Pi session and is reflected in the context panel.
9. Missing Pi authentication and runtime failures appear as readable errors instead of a blank window.

## Verification strategy

- TypeScript check plus Vite production build.
- Manual Electron QA: connect, switch between all three agents, verify each conversation changes, expand agent-scoped history, switch workspace, create a session, send a read-only prompt, observe streamed text/tool activity, scroll a long conversation, stop a longer response, reopen history, and restart the app.
